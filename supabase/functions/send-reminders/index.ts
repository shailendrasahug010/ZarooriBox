// Supabase Edge Function (Deno): delivers due reminders over server-side channels.
// Schedule it every 15 minutes with Supabase Cron. It uses the service role key,
// so it runs on the server only and never ships to the browser.
//
// Each channel is a small adapter; plug in a provider (Resend/SES for email,
// WhatsApp Cloud API, MSG91/Twilio for SMS) by implementing `send`.

import { createClient } from 'npm:@supabase/supabase-js@2';

interface Delivery {
  userId: string;
  title: string;
  body: string;
}

interface Channel {
  id: 'email' | 'whatsapp' | 'sms';
  enabled(prefs: Record<string, unknown>): boolean;
  send(d: Delivery): Promise<void>;
}

const channels: Channel[] = [
  {
    id: 'email',
    enabled: (p) => p.email === true,
    async send(_d) {
      // TODO: call your email provider here.
    },
  },
  {
    id: 'whatsapp',
    enabled: (p) => p.whatsapp === true,
    async send(_d) {
      // TODO: WhatsApp Cloud API template message (Pro).
    },
  },
  {
    id: 'sms',
    enabled: (p) => p.sms === true,
    async send(_d) {
      // TODO: SMS provider (Pro).
    },
  },
];

Deno.serve(async () => {
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const today = new Date().toISOString().slice(0, 10);

  const { data: due, error } = await sb
    .from('reminders')
    .select('id, user_id, remind_on, notified_for, memories!inner(id, title, due_date, status)')
    .lte('remind_on', today)
    .eq('memories.status', 'active');
  if (error) return new Response(error.message, { status: 500 });

  let sent = 0;
  for (const r of due ?? []) {
    const m = (r as any).memories;
    if (!m?.due_date || r.notified_for === m.due_date) continue;
    const { data: settings } = await sb.from('user_settings').select('notifications').eq('user_id', r.user_id).maybeSingle();
    const prefs = (settings?.notifications ?? {}) as Record<string, unknown>;
    const delivery = { userId: r.user_id, title: m.title, body: `Due ${m.due_date}` };
    for (const c of channels) if (c.enabled(prefs)) await c.send(delivery);
    await sb.from('notifications').insert({ id: crypto.randomUUID(), user_id: r.user_id, memory_id: m.id, title: m.title, body: delivery.body, channel: 'in_app' });
    await sb.from('reminders').update({ notified_for: m.due_date }).eq('id', r.id);
    sent++;
  }
  return Response.json({ sent });
});
