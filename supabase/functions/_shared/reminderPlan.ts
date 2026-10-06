// Pure planning logic for outside-the-app reminders (email, WhatsApp, SMS).
// No I/O here, so it is unit-tested in reminderPlan.test.ts.
//
// Rules:
// - Each person gets messages once a day, at their chosen time in their own timezone
//   (never at 3 a.m. because a server clock says so).
// - "Morning summary" on: one message listing everything. Off: one message per item.
// - Each reminder is delivered once per due date (reminders.delivered_for), and each
//   lending follow-up once per follow-up date (lendings.delivered_for).

export type ExternalChannel = 'email' | 'whatsapp' | 'sms';

export interface SettingsRow {
  user_id: string;
  plan: 'free' | 'pro';
  phone: string | null;
  timezone: string | null;
  last_digest_on: string | null;
  notifications: {
    email?: boolean;
    whatsapp?: boolean;
    sms?: boolean;
    dailyDigest?: boolean;
    digestTime?: string;
  };
}

export interface DueReminder {
  reminder_id: string;
  memory_id: string;
  title: string;
  due_date: string;
  remind_on: string;
  delivered_for: string | null;
}

export interface DueLending {
  lending_id: string;
  title: string;
  follow_up_date: string;
  delivered_for: string | null;
}

export interface PlannedMessage {
  channel: ExternalChannel;
  subject: string;
  text: string;
  /** Lines in the message, for the email's HTML list. */
  lines: string[];
}

export interface Plan {
  localDate: string;
  messages: PlannedMessage[];
  reminderUpdates: { id: string; deliveredFor: string }[];
  lendingUpdates: { id: string; deliveredFor: string }[];
}

const PRO_CHANNELS: ExternalChannel[] = ['whatsapp', 'sms'];

/** Local calendar date and HH:MM for an instant in an IANA timezone. Unknown zones fall back to Asia/Kolkata. */
export function localParts(now: Date, timezone: string | null): { date: string; time: string } {
  const fmt = (tz: string) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = fmt(timezone || 'Asia/Kolkata').formatToParts(now);
  } catch {
    parts = fmt('Asia/Kolkata').formatToParts(now);
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

export function enabledChannels(s: SettingsRow, earlyAccess: boolean): ExternalChannel[] {
  const out: ExternalChannel[] = [];
  const pro = s.plan === 'pro' || earlyAccess;
  for (const c of ['email', 'whatsapp', 'sms'] as const) {
    if (!s.notifications?.[c]) continue;
    if (PRO_CHANNELS.includes(c) && !pro) continue;
    if (c !== 'email' && !s.phone) continue;
    out.push(c);
  }
  return out;
}

function dayDiff(a: string, b: string) {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
}

export function whenText(due: string, today: string): string {
  const d = dayDiff(due, today);
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d === -1) return 'yesterday';
  if (d < 0) return `${-d} days ago`;
  return `in ${d} days`;
}

/**
 * Decides what one person should receive right now. Returns null when it is not
 * their time yet, they already got today's messages, or there is nothing to send.
 */
export function planForUser(
  s: SettingsRow,
  reminders: DueReminder[],
  lendings: DueLending[],
  now: Date,
  earlyAccess = true,
): Plan | null {
  const channels = enabledChannels(s, earlyAccess);
  if (!channels.length) return null;
  const { date: today, time } = localParts(now, s.timezone);
  const sendAt = /^\d{2}:\d{2}$/.test(s.notifications?.digestTime ?? '') ? s.notifications.digestTime! : '08:00';
  if (time < sendAt || s.last_digest_on === today) return null;

  const dueReminders = reminders.filter((r) => r.remind_on <= today && r.delivered_for !== r.due_date && dayDiff(r.due_date, today) >= -7);
  const dueLendings = lendings.filter((l) => l.follow_up_date <= today && l.delivered_for !== l.follow_up_date);
  if (!dueReminders.length && !dueLendings.length) return { localDate: today, messages: [], reminderUpdates: [], lendingUpdates: [] };

  const items = [
    ...dueReminders
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
      .map((r) => ({ subject: `${r.title}: due ${whenText(r.due_date, today)}`, line: `${r.title} (due ${whenText(r.due_date, today)})` })),
    ...dueLendings.map((l) => ({ subject: `Follow up: ${l.title}`, line: `Follow up: ${l.title}` })),
  ];

  const messages: PlannedMessage[] = [];
  for (const channel of channels) {
    if (s.notifications.dailyDigest !== false) {
      const lines = items.map((i) => i.line);
      const subject = items.length === 1 ? `LifeBox: ${items[0].subject}` : `LifeBox: ${items.length} things need you today`;
      messages.push({ channel, subject, lines, text: `Good morning! From LifeBox:\n${lines.map((l) => `• ${l}`).join('\n')}` });
    } else {
      for (const i of items) messages.push({ channel, subject: `LifeBox: ${i.subject}`, lines: [i.line], text: `LifeBox reminder: ${i.line}` });
    }
  }
  return {
    localDate: today,
    messages,
    reminderUpdates: dueReminders.map((r) => ({ id: r.reminder_id, deliveredFor: r.due_date })),
    lendingUpdates: dueLendings.map((l) => ({ id: l.lending_id, deliveredFor: l.follow_up_date })),
  };
}
