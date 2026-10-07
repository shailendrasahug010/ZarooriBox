// The Done / Tomorrow / Next week links in reminder emails open ZarooriBox's /act page,
// which calls this function with the link's signed token. No sign-in is needed: the
// token itself proves which person and item it is for (see _shared/actionToken.ts).
//
// POST { token }            -> { kind, title, status }  (to show what the link is about)
// POST { token, action }    -> { ok: true, message }     action: done | tomorrow | week
//
// Deploy with --no-verify-jwt. Uses SUPABASE_SERVICE_ROLE_KEY, which Supabase provides.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { actionSecret, verifyAction, type ActionClaims } from '../_shared/actionToken.ts';
import { corsHeaders, json } from '../_shared/cors.ts';
import { localParts } from '../_shared/reminderPlan.ts';
import { addDays, planMemoryAction, type Action } from '../_shared/reminderActions.ts';

const env = (k: string) => Deno.env.get(k);
const ACTIONS: Action[] = ['done', 'tomorrow', 'week'];

/** The person's own items, or items shared with the family they are in now. */
async function canUse(sb: SupabaseClient, userId: string, owner: string, householdId: string | null): Promise<boolean> {
  if (owner === userId) return true;
  if (!householdId) return false;
  const { data } = await sb.from('household_members').select('user_id').eq('user_id', userId).eq('household_id', householdId).eq('active', true).maybeSingle();
  return !!data;
}

async function today(sb: SupabaseClient, userId: string): Promise<string> {
  const { data } = await sb.from('user_settings').select('timezone').eq('user_id', userId).maybeSingle();
  return localParts(new Date(), data?.timezone ?? null).date;
}

async function memoryAction(sb: SupabaseClient, c: ActionClaims, action: Action | null) {
  const { data: m } = await sb.from('memories').select('id, user_id, household_id, title, status, due_date').eq('id', c.id).maybeSingle();
  if (!m || !(await canUse(sb, c.userId, m.user_id, m.household_id))) return { status: 404, body: { error: 'This item was deleted or is no longer shared with you.' } };
  if (!action) return { status: 200, body: { kind: 'memory', title: m.title, status: m.status } };

  const [{ data: rec }, { data: rem }] = await Promise.all([
    sb.from('recurring_items').select('interval, unit').eq('memory_id', m.id).maybeSingle(),
    sb.from('reminders').select('id, offset_days, remind_on').eq('memory_id', m.id).limit(1).maybeSingle(),
  ]);
  const change = planMemoryAction({ status: m.status, due_date: m.due_date, repeat: rec ?? null, reminder: rem ?? null }, action, await today(sb, c.userId), m.title);
  const stamp = new Date().toISOString();
  if (change.type === 'complete') {
    await sb.from('memories').update({ status: 'completed', completed_at: stamp, updated_at: stamp }).eq('id', m.id);
  } else if (change.type === 'roll') {
    await sb.from('memories').update({ due_date: change.nextDue, last_completed_at: stamp, updated_at: stamp }).eq('id', m.id);
    if (rem && change.reminderOn) await sb.from('reminders').update({ remind_on: change.reminderOn, notified_for: null }).eq('id', rem.id);
  } else if (change.type === 'snooze') {
    if (rem) await sb.from('reminders').update({ remind_on: change.remindOn, notified_for: null }).eq('id', rem.id);
    else await sb.from('reminders').insert({ id: `rem_${crypto.randomUUID()}`, user_id: m.user_id, memory_id: m.id, offset_days: null, remind_on: change.remindOn });
  }
  return { status: 200, body: { ok: true, message: change.message } };
}

async function lendingAction(sb: SupabaseClient, c: ActionClaims, action: Action | null) {
  const { data: l } = await sb.from('lendings').select('id, user_id, status, direction, kind, amount, currency, item_name, people(name)').eq('id', c.id).maybeSingle();
  if (!l || l.user_id !== c.userId) return { status: 404, body: { error: 'This item was deleted.' } };
  const who = (l.people as unknown as { name: string } | null)?.name ?? 'someone';
  const amount = new Intl.NumberFormat('en-IN', { style: 'currency', currency: l.currency || 'INR', maximumFractionDigits: 0 }).format(Number(l.amount ?? 0));
  const title = l.kind === 'money' ? `${l.direction === 'lent' ? `${who} owes you` : `You owe ${who}`} ${amount}` : `${l.item_name} (${who})`;
  if (!action) return { status: 200, body: { kind: 'lending', title, status: l.status } };
  const stamp = new Date().toISOString();
  if (action === 'done') {
    await sb.from('lendings').update({ status: 'returned', returned_at: stamp, updated_at: stamp }).eq('id', l.id);
    return { status: 200, body: { ok: true, message: 'Marked as settled.' } };
  }
  const followUp = addDays(await today(sb, c.userId), action === 'week' ? 7 : 1);
  await sb.from('lendings').update({ follow_up_date: followUp, updated_at: stamp }).eq('id', l.id);
  return { status: 200, body: { ok: true, message: `We’ll remind you ${action === 'week' ? 'next week' : 'tomorrow'}.` } };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const secret = actionSecret(env);
  if (!secret) return json({ error: 'Not configured' }, 500);

  const body = await req.json().catch(() => ({}));
  const claims = typeof body?.token === 'string' ? await verifyAction(secret, body.token) : null;
  if (!claims) return json({ error: 'This link has expired. Open ZarooriBox to update the item.' }, 401);
  const action = body.action === undefined ? null : ACTIONS.includes(body.action) ? (body.action as Action) : undefined;
  if (action === undefined) return json({ error: 'Unknown action' }, 400);

  const sb = createClient(env('SUPABASE_URL')!, env('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  try {
    const r = claims.kind === 'memory' ? await memoryAction(sb, claims, action) : await lendingAction(sb, claims, action);
    return json(r.body, r.status);
  } catch (e) {
    console.error(e);
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  }
});
