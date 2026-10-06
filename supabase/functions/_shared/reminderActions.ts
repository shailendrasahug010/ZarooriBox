// What the Done / Tomorrow / Next week buttons in a reminder email do, on the server.
// Mirrors LifeBoxStore.act() in the app: Done on a repeating item rolls it to the next
// date instead of finishing it; snoozing moves the reminder (or follow-up) date.

export type Action = 'done' | 'tomorrow' | 'week';

export interface Repeat {
  interval: number;
  unit: 'day' | 'week' | 'month' | 'year';
}

const pad = (n: number) => String(n).padStart(2, '0');
const parts = (iso: string) => iso.split('-').map(Number) as [number, number, number];
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

export function prettyDate(date: string): string {
  const [y, m, d] = parts(date);
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = parts(date);
  return iso(new Date(Date.UTC(y, m - 1, d + n)));
}

/** Adds months, clamping to the last day (31 Jan + 1 month = 28/29 Feb), like the app. */
export function addMonths(date: string, n: number): string {
  const [y, m, d] = parts(date);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return iso(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, last))));
}

function addUnit(date: string, r: Repeat): string {
  const n = Math.max(1, r.interval);
  if (r.unit === 'day') return addDays(date, n);
  if (r.unit === 'week') return addDays(date, n * 7);
  if (r.unit === 'month') return addMonths(date, n);
  return addMonths(date, n * 12);
}

/** The first occurrence after `today`, so finishing an overdue monthly bill lands on a future cycle. */
export function nextOccurrenceAfter(due: string, r: Repeat, today: string): string {
  let next = addUnit(due, r);
  for (let i = 0; next <= today && i < 1000; i++) next = addUnit(next, r);
  return next;
}

export interface MemoryState {
  status: string;
  due_date: string | null;
  repeat: Repeat | null;
  reminder: { id: string; offset_days: number | null; remind_on: string } | null;
}

export type MemoryChange =
  | { type: 'none'; message: string }
  | { type: 'complete'; message: string }
  | { type: 'roll'; nextDue: string; reminderOn: string | null; message: string }
  | { type: 'snooze'; remindOn: string; message: string };

export function planMemoryAction(m: MemoryState, action: Action, today: string, title: string): MemoryChange {
  if (action !== 'done') {
    const remindOn = addDays(today, action === 'week' ? 7 : 1);
    return { type: 'snooze', remindOn, message: `We’ll remind you about “${title}” ${action === 'week' ? 'next week' : 'tomorrow'}.` };
  }
  if (m.status !== 'active') return { type: 'none', message: `“${title}” is already done.` };
  if (m.repeat && m.due_date) {
    const nextDue = nextOccurrenceAfter(m.due_date, m.repeat, today);
    const r = m.reminder;
    const reminderOn = r ? (r.offset_days != null ? addDays(nextDue, -r.offset_days) : r.remind_on) : null;
    return { type: 'roll', nextDue, reminderOn, message: `Done! The next one is on ${prettyDate(nextDue)}.` };
  }
  return { type: 'complete', message: `“${title}” is done.` };
}
