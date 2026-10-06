// Provider adapters for outside-the-app reminders. Each one is switched on by its
// secrets (set with `supabase secrets set ...`); a channel without secrets is
// reported as not configured and skipped, so the rest still deliver.
//
//   Email     Resend          RESEND_API_KEY, RESEND_FROM ("LifeBox <reminders@yourdomain.com>")
//   WhatsApp  Meta Cloud API  WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TEMPLATE,
//                             WHATSAPP_TEMPLATE_LANG (default "en")
//   SMS       Twilio          TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM

import type { ExternalChannel, PlannedMessage } from './reminderPlan.ts';

export interface Recipient {
  email: string | null;
  phone: string | null;
  name: string;
}

export interface SendResult {
  ok: boolean;
  error?: string;
}

type Env = (key: string) => string | undefined;
type Fetch = typeof fetch;

export interface Messenger {
  configured(channel: ExternalChannel): boolean;
  send(channel: ExternalChannel, to: Recipient, msg: PlannedMessage): Promise<SendResult>;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function emailHtml(to: Recipient, msg: PlannedMessage, appUrl: string): string {
  const btn = 'color:#17745D;font-weight:600;text-decoration:none;margin-right:14px';
  const actions = (i: number) => {
    const link = msg.actionLinks?.[i];
    if (!link) return '';
    const a = (act: string, label: string) => `<a href="${escapeHtml(`${link}&do=${act}`)}" style="${btn}">${label}</a>`;
    return `<br><span style="font-size:14px">${a('done', '✓ Done')}${a('tomorrow', 'Tomorrow')}${a('week', 'Next week')}</span>`;
  };
  const items = msg.lines.map((l, i) => `<li style="margin:10px 0">${escapeHtml(l)}${actions(i)}</li>`).join('');
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:auto;color:#1c1917">
  <p style="font-size:16px">Hi ${escapeHtml(to.name || 'there')},</p>
  <p style="font-size:16px">Here’s what needs your attention:</p>
  <ul style="font-size:16px;padding-left:20px">${items}</ul>
  <p><a href="${escapeHtml(appUrl)}/app" style="display:inline-block;background:#17745D;color:#fff;padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:600">Open LifeBox</a></p>
  <p style="font-size:12px;color:#78716c">You get this because email reminders are on in LifeBox settings.</p>
</div>`;
}

/** WhatsApp template parameters cannot contain newlines or tabs, or more than 4 spaces in a row. */
export function whatsappParam(text: string): string {
  return text.replace(/[\n\t]+/g, ' · ').replace(/ {4,}/g, '   ').slice(0, 1000);
}

export function createMessenger(env: Env, http: Fetch = fetch): Messenger {
  const has = (...keys: string[]) => keys.every((k) => !!env(k));
  const appUrl = env('LIFEBOX_APP_URL') ?? 'https://lifebox.app';

  const configured = (c: ExternalChannel) =>
    c === 'email'
      ? has('RESEND_API_KEY', 'RESEND_FROM')
      : c === 'whatsapp'
        ? has('WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_TEMPLATE')
        : has('TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM');

  async function post(url: string, init: RequestInit): Promise<SendResult> {
    try {
      const res = await http(url, { ...init, signal: AbortSignal.timeout(10_000) });
      if (res.ok) return { ok: true };
      return { ok: false, error: `${res.status} ${(await res.text()).slice(0, 300)}` };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  return {
    configured,
    async send(channel, to, msg) {
      if (!configured(channel)) return { ok: false, error: `${channel} is not configured` };
      if (channel === 'email') {
        if (!to.email) return { ok: false, error: 'no email address' };
        return post('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: env('RESEND_FROM'), to: [to.email], subject: msg.subject, text: msg.text, html: emailHtml(to, msg, appUrl) }),
        });
      }
      if (!to.phone) return { ok: false, error: 'no phone number' };
      if (channel === 'whatsapp') {
        // Business-initiated WhatsApp messages must use an approved template. Create one
        // with a single body variable, e.g. "LifeBox reminder: {{1}}".
        return post(`https://graph.facebook.com/v21.0/${env('WHATSAPP_PHONE_NUMBER_ID')}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${env('WHATSAPP_TOKEN')}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: to.phone.replace(/^\+/, ''),
            type: 'template',
            template: {
              name: env('WHATSAPP_TEMPLATE'),
              language: { code: env('WHATSAPP_TEMPLATE_LANG') ?? 'en' },
              components: [{ type: 'body', parameters: [{ type: 'text', text: whatsappParam(msg.lines.join('; ')) }] }],
            },
          }),
        });
      }
      const sid = env('TWILIO_ACCOUNT_SID')!;
      return post(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: `Basic ${btoa(`${sid}:${env('TWILIO_AUTH_TOKEN')}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ To: to.phone, From: env('TWILIO_FROM')!, Body: msg.text.slice(0, 1500) }),
      });
    },
  };
}
