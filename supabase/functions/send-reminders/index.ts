// Delivers LifeBox reminders by email, WhatsApp and SMS.
//
// Two ways in:
// - The scheduler (supabase/cron.sql) calls it every 15 minutes with the
//   x-cron-secret header. It then works out, per person, whether it is their chosen
//   time in their timezone and sends what is due (see _shared/reminderPlan.ts).
// - A signed-in person can POST { "test": true } from Settings to get a test message
//   on each channel they switched on.
//
// Family members get their own reminders for items shared with their family, at their
// own time and on their own channels. Emails carry Done / Tomorrow / Next week links
// (signed per person and item, see _shared/actionToken.ts) that open LIFEBOX_APP_URL/act.
//
// Secrets: the provider keys listed in _shared/messaging.ts. The scheduler's secret
// is generated in Vault by cron.sql (or set CRON_SECRET to use your own).
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';
import { actionSecret, signAction } from '../_shared/actionToken.ts';
import { createMessenger, type Recipient } from '../_shared/messaging.ts';
import { enabledChannels, planForUser, type DueLending, type DueReminder, type ExternalChannel, type SettingsRow } from '../_shared/reminderPlan.ts';

const env = (k: string) => Deno.env.get(k);
const EARLY_ACCESS = env('LIFEBOX_EARLY_ACCESS') !== 'false';
const messenger = createMessenger(env);
const admin = () => createClient(env('SUPABASE_URL')!, env('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

const SETTINGS_COLS = 'user_id, plan, phone, timezone, last_digest_on, notifications';
const APP_URL = (env('LIFEBOX_APP_URL') ?? 'https://lifebox.app').replace(/\/$/, '');

interface ReminderRow {
  id: string;
  user_id: string;
  remind_on: string;
  delivered_for: string | null;
  delivered_to: Record<string, string> | null;
  memories: { id: string; title: string; due_date: string | null; status: string };
}

const REMINDER_COLS = 'id, user_id, remind_on, delivered_for, delivered_to, memories!inner(id, title, due_date, status, household_id)';

async function householdOf(sb: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await sb.from('household_members').select('household_id').eq('user_id', userId).eq('active', true).maybeSingle();
  return data?.household_id ?? null;
}

function money(amount: number | null, currency: string) {
  if (amount == null) return '';
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

interface LendingRow {
  id: string;
  user_id: string;
  follow_up_date: string;
  delivered_for: string | null;
  direction: 'lent' | 'borrowed';
  kind: 'money' | 'thing';
  amount: number | null;
  currency: string;
  item_name: string | null;
  people: { name: string } | null;
}

export function lendingTitle(l: LendingRow): string {
  const who = l.people?.name ?? 'someone';
  if (l.kind === 'money') {
    const amt = money(l.amount, l.currency);
    return l.direction === 'lent' ? `${who} owes you ${amt}` : `Pay ${who} back ${amt}`;
  }
  return l.direction === 'lent' ? `${who} has your ${l.item_name}` : `Return the ${l.item_name} to ${who}`;
}

async function recipientFor(sb: SupabaseClient, s: SettingsRow): Promise<Recipient> {
  const { data } = await sb.auth.admin.getUserById(s.user_id);
  const u = data?.user;
  const meta = (u?.user_metadata ?? {}) as Record<string, unknown>;
  const name = String(meta.name ?? meta.full_name ?? '').split(' ')[0];
  return { email: u?.email ?? null, phone: s.phone, name };
}

function configuredChannels(s: SettingsRow): ExternalChannel[] {
  return enabledChannels(s, EARLY_ACCESS).filter((c) => messenger.configured(c));
}

async function runSchedule(sb: SupabaseClient, now: Date) {
  const { data: settings, error } = await sb
    .from('user_settings')
    .select(SETTINGS_COLS)
    .or('notifications->>email.eq.true,notifications->>whatsapp.eq.true,notifications->>sms.eq.true');
  if (error) throw error;

  // Anyone on Earth is at most 14 hours ahead of UTC.
  const horizon = new Date(now.getTime() + 15 * 3600_000).toISOString().slice(0, 10);
  const summary = { users: 0, sent: 0, failed: 0 };

  for (const s of (settings ?? []) as SettingsRow[]) {
    const channels = configuredChannels(s);
    if (!channels.length) continue;

    const household = await householdOf(sb, s.user_id);
    const [{ data: rem }, { data: shared }, { data: len }] = await Promise.all([
      sb.from('reminders').select(REMINDER_COLS).eq('user_id', s.user_id).eq('memories.status', 'active').lte('remind_on', horizon),
      // Items other family members share with this person.
      household
        ? sb.from('reminders').select(REMINDER_COLS).neq('user_id', s.user_id).eq('memories.household_id', household).eq('memories.status', 'active').lte('remind_on', horizon)
        : Promise.resolve({ data: [] }),
      sb
        .from('lendings')
        .select('id, user_id, follow_up_date, delivered_for, direction, kind, amount, currency, item_name, people(name)')
        .eq('user_id', s.user_id)
        .eq('status', 'open')
        .not('follow_up_date', 'is', null)
        .lte('follow_up_date', horizon),
    ]);

    const rows = [...((rem ?? []) as unknown as ReminderRow[]), ...((shared ?? []) as unknown as ReminderRow[])];
    const byId = new Map(rows.map((r) => [r.id, r]));
    const reminders: DueReminder[] = rows.flatMap((r) => {
      const m = r.memories;
      // The owner's deliveries are in delivered_for; each family member's in delivered_to.
      const delivered = r.user_id === s.user_id ? r.delivered_for : r.delivered_to?.[s.user_id] ?? null;
      return m?.due_date ? [{ reminder_id: r.id, memory_id: m.id, title: m.title, due_date: m.due_date, remind_on: r.remind_on, delivered_for: delivered }] : [];
    });
    const lendings: DueLending[] = ((len ?? []) as unknown as LendingRow[]).map((l) => ({
      lending_id: l.id,
      title: lendingTitle(l),
      follow_up_date: l.follow_up_date,
      delivered_for: l.delivered_for,
    }));

    const plan = planForUser({ ...s, notifications: { ...s.notifications, ...Object.fromEntries((['email', 'whatsapp', 'sms'] as const).map((c) => [c, channels.includes(c)])) } }, reminders, lendings, now, EARLY_ACCESS);
    if (!plan) continue;
    summary.users++;

    let anyOk = plan.messages.length === 0;
    if (plan.messages.length) {
      const to = await recipientFor(sb, s);
      const secret = actionSecret(env);
      for (const msg of plan.messages) {
        if (msg.channel === 'email' && secret && msg.targets) {
          msg.actionLinks = await Promise.all(msg.targets.map(async (t) => `${APP_URL}/act?t=${await signAction(secret, s.user_id, t)}`));
        }
        const res = await messenger.send(msg.channel, to, msg);
        if (res.ok) {
          anyOk = true;
          summary.sent++;
          await sb.from('notifications').insert({ id: crypto.randomUUID(), user_id: s.user_id, title: msg.subject, body: msg.lines.join('\n'), channel: msg.channel });
        } else {
          summary.failed++;
          console.error(`send ${msg.channel} to ${s.user_id} failed: ${res.error}`);
        }
      }
    }
    // If every provider failed, leave things unmarked so the next run retries.
    if (!anyOk) continue;
    for (const u of plan.reminderUpdates) {
      const row = byId.get(u.id);
      if (!row || row.user_id === s.user_id) await sb.from('reminders').update({ delivered_for: u.deliveredFor }).eq('id', u.id);
      else await sb.from('reminders').update({ delivered_to: { ...(row.delivered_to ?? {}), [s.user_id]: u.deliveredFor } }).eq('id', u.id);
    }
    for (const u of plan.lendingUpdates) await sb.from('lendings').update({ delivered_for: u.deliveredFor }).eq('id', u.id);
    await sb.from('user_settings').update({ last_digest_on: plan.localDate }).eq('user_id', s.user_id);
  }
  return summary;
}

async function runTest(sb: SupabaseClient, userId: string) {
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await sb.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('title', 'LifeBox test').gte('created_at', since);
  if ((count ?? 0) > 0) return { status: 429, body: { error: 'Please wait a minute before sending another test.' } };

  const { data: s } = await sb.from('user_settings').select(SETTINGS_COLS).eq('user_id', userId).maybeSingle();
  if (!s) return { status: 404, body: { error: 'Save your settings first.' } };
  const settings = s as SettingsRow;
  const wanted = enabledChannels(settings, EARLY_ACCESS);
  if (!wanted.length) return { status: 400, body: { error: 'Turn on email, WhatsApp or SMS first (WhatsApp and SMS need a phone number).' } };

  const to = await recipientFor(sb, settings);
  const results: Record<string, { ok: boolean; error?: string }> = {};
  for (const channel of wanted) {
    if (!messenger.configured(channel)) {
      results[channel] = { ok: false, error: 'not_configured' };
      continue;
    }
    results[channel] = await messenger.send(channel, to, {
      channel,
      subject: 'LifeBox test',
      lines: ['This is a test reminder. If you can read it, you’re all set.'],
      text: 'LifeBox test: if you can read this, reminders will reach you here.',
    });
  }
  await sb.from('notifications').insert({ id: crypto.randomUUID(), user_id: userId, title: 'LifeBox test', body: JSON.stringify(results), channel: 'in_app', read_at: new Date().toISOString() });
  return { status: 200, body: { results } };
}

/** The scheduler proves itself with a secret kept in Vault (see cron.sql), or CRON_SECRET if set. */
async function isScheduler(sb: SupabaseClient, secret: string | null): Promise<boolean> {
  if (!secret) return false;
  const fromEnv = env('CRON_SECRET');
  if (fromEnv) return secret === fromEnv;
  const { data } = await sb.rpc('check_cron_secret', { secret });
  return data === true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const sb = admin();

  if (await isScheduler(sb, req.headers.get('x-cron-secret'))) {
    try {
      return json(await runSchedule(sb, new Date()));
    } catch (e) {
      console.error(e);
      return json({ error: 'Schedule run failed' }, 500);
    }
  }

  // Otherwise only a signed-in person sending themselves a test.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth } = token ? await sb.auth.getUser(token) : { data: { user: null } };
  if (!auth.user) return json({ error: 'Not signed in' }, 401);
  const body = await req.json().catch(() => ({}));
  if (body?.test !== true) return json({ error: 'Unsupported request' }, 400);
  const r = await runTest(sb, auth.user.id);
  return json(r.body, r.status);
});
