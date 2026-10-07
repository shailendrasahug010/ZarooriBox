// deno test supabase/functions/_shared
import { localParts, planForUser, whenText, type SettingsRow } from './reminderPlan.ts';
import { createMessenger, whatsappParam } from './messaging.ts';

function eq(a: unknown, b: unknown, msg = '') {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}\nexpected ${JSON.stringify(b)}\n     got ${JSON.stringify(a)}`);
}

const base: SettingsRow = {
  user_id: 'u1',
  plan: 'free',
  phone: '+919876543210',
  timezone: 'Asia/Kolkata',
  last_digest_on: null,
  notifications: { email: true, whatsapp: false, sms: false, dailyDigest: true, digestTime: '08:00' },
};
const rem = (id: string, due: string, remindOn = due, delivered: string | null = null) => ({ reminder_id: id, memory_id: `m${id}`, title: `Item ${id}`, due_date: due, remind_on: remindOn, delivered_for: delivered });

// 2026-10-07 02:45 UTC = 08:15 in India
const at815 = new Date('2026-10-07T02:45:00Z');
const at730 = new Date('2026-10-07T02:00:00Z');

Deno.test('local time follows the person’s timezone', () => {
  eq(localParts(at815, 'Asia/Kolkata'), { date: '2026-10-07', time: '08:15' });
  eq(localParts(at815, 'America/New_York'), { date: '2026-10-06', time: '22:45' });
  eq(localParts(at815, 'Not/AZone'), { date: '2026-10-07', time: '08:15' }, 'bad zone falls back to India');
});

Deno.test('waits for the chosen time, and sends once a day', () => {
  eq(planForUser(base, [rem('1', '2026-10-07')], [], at730), null, 'before 08:00');
  const p = planForUser(base, [rem('1', '2026-10-07')], [], at815)!;
  eq(p.messages.length, 1);
  eq(p.messages[0].subject, 'ZarooriBox: Item 1: due today');
  eq(p.reminderUpdates, [{ id: '1', deliveredFor: '2026-10-07' }]);
  eq(planForUser({ ...base, last_digest_on: '2026-10-07' }, [rem('1', '2026-10-07')], [], at815), null, 'already sent today');
});

Deno.test('digest groups items; without digest each item is its own message', () => {
  const items = [rem('1', '2026-10-09', '2026-10-06'), rem('2', '2026-10-07')];
  const lend = [{ lending_id: 'l1', title: 'Rahul owes you ₹500', follow_up_date: '2026-10-07', delivered_for: null }];
  const digest = planForUser(base, items, lend, at815)!;
  eq(digest.messages.length, 1);
  eq(digest.messages[0].lines, ['Item 2 (due today)', 'Item 1 (due in 2 days)', 'Follow up: Rahul owes you ₹500']);
  eq(digest.messages[0].subject, 'ZarooriBox: 3 things need you today');
  const each = planForUser({ ...base, notifications: { ...base.notifications, dailyDigest: false } }, items, lend, at815)!;
  eq(each.messages.length, 3);
});

Deno.test('skips delivered, future and stale reminders', () => {
  const p = planForUser(base, [rem('done', '2026-10-07', '2026-10-07', '2026-10-07'), rem('future', '2026-10-20', '2026-10-13'), rem('stale', '2026-09-01')], [], at815)!;
  eq(p.messages.length, 0);
});

Deno.test('a snoozed reminder is sent again on its new date', () => {
  // Sent on 10-05 for a bill due 10-08, then snoozed to 10-07.
  const p = planForUser(base, [rem('1', '2026-10-08', '2026-10-07', '2026-10-05')], [], at815)!;
  eq(p.messages.length, 1);
  eq(p.reminderUpdates, [{ id: '1', deliveredFor: '2026-10-07' }]);
  eq(p.messages[0].targets, [{ kind: 'memory', id: 'm1' }]);
});

Deno.test('WhatsApp and SMS need a phone number and Pro (unless early access)', () => {
  const s = { ...base, notifications: { ...base.notifications, email: false, whatsapp: true, sms: true } };
  eq(planForUser(s, [rem('1', '2026-10-07')], [], at815, true)!.messages.map((m) => m.channel), ['whatsapp', 'sms']);
  eq(planForUser(s, [rem('1', '2026-10-07')], [], at815, false), null, 'free plan without early access');
  eq(planForUser({ ...s, phone: null }, [rem('1', '2026-10-07')], [], at815, true), null, 'no phone');
});

Deno.test('whenText', () => {
  eq(['2026-10-07', '2026-10-08', '2026-10-05', '2026-10-17'].map((d) => whenText(d, '2026-10-07')), ['today', 'tomorrow', '2 days ago', 'in 10 days']);
});

Deno.test('messenger calls each provider with the right request', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fakeFetch = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(new Response('{}', { status: 200 }));
  }) as unknown as typeof fetch;
  const secrets: Record<string, string> = {
    RESEND_API_KEY: 're_x', RESEND_FROM: 'ZarooriBox <r@x.com>',
    WHATSAPP_TOKEN: 'wa', WHATSAPP_PHONE_NUMBER_ID: '123', WHATSAPP_TEMPLATE: 'zaroori_reminder',
    TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 'tok', TWILIO_FROM: '+15550001111',
  };
  const m = createMessenger((k) => secrets[k], fakeFetch);
  const to = { email: 'a@b.com', phone: '+919876543210', name: 'Ananya' };
  const msg = { channel: 'email' as const, subject: 'S', text: 'Line\nTwo', lines: ['<b>Line</b>', 'Two'] };
  for (const c of ['email', 'whatsapp', 'sms'] as const) eq((await m.send(c, to, { ...msg, channel: c })).ok, true, c);
  eq(calls.map((c) => c.url), ['https://api.resend.com/emails', 'https://graph.facebook.com/v21.0/123/messages', 'https://api.twilio.com/2010-04-01/Accounts/AC1/Messages.json']);
  const email = JSON.parse(String(calls[0].init.body));
  eq(email.to, ['a@b.com']);
  if (!email.html.includes('&lt;b&gt;Line&lt;/b&gt;')) throw new Error('email html must escape item text');
  const wa = JSON.parse(String(calls[1].init.body));
  eq(wa.to, '919876543210');
  eq(wa.template.components[0].parameters[0].text, '<b>Line</b>; Two');
  eq(String(calls[2].init.body), 'To=%2B919876543210&From=%2B15550001111&Body=Line%0ATwo');

  const none = createMessenger(() => undefined, fakeFetch);
  eq(none.configured('email'), false);
  eq((await none.send('sms', to, msg)).ok, false);
});

Deno.test('whatsappParam strips newlines', () => {
  eq(whatsappParam('a\nb\tc     d'), 'a · b · c   d');
});
