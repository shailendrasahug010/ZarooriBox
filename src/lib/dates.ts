import type { ISODate, RepeatSpec, RepeatFrequency, RepeatUnit } from '../types';

// All Zaroori dates are local calendar days ("YYYY-MM-DD"), never UTC timestamps,
// so "due today" means today where the user is.

let nowOverride: Date | null = null;
/** Test hook: pin "now" to a fixed date. */
export function setNow(d: Date | null) {
  nowOverride = d;
}
export function now(): Date {
  return nowOverride ? new Date(nowOverride) : new Date();
}

const pad = (n: number) => String(n).padStart(2, '0');

export function toISO(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromISO(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isValidISO(iso: string | null | undefined): iso is ISODate {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = fromISO(iso);
  return toISO(d) === iso;
}

export function todayISO(): ISODate {
  return toISO(now());
}

export function addDays(iso: ISODate, days: number): ISODate {
  const d = fromISO(iso);
  d.setDate(d.getDate() + days);
  return toISO(d);
}

/** Adds months, clamping to the last day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(iso: ISODate, months: number): ISODate {
  const d = fromISO(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toISO(d);
}

export function addYears(iso: ISODate, years: number): ISODate {
  return addMonths(iso, years * 12);
}

export function addUnit(iso: ISODate, n: number, unit: RepeatUnit): ISODate {
  switch (unit) {
    case 'day':
      return addDays(iso, n);
    case 'week':
      return addDays(iso, n * 7);
    case 'month':
      return addMonths(iso, n);
    case 'year':
      return addYears(iso, n);
  }
}

/** Whole days from a to b (b - a). */
export function diffDays(a: ISODate, b: ISODate): number {
  const ms = fromISO(b).getTime() - fromISO(a).getTime();
  return Math.round(ms / 86_400_000);
}

export function daysFromToday(iso: ISODate): number {
  return diffDays(todayISO(), iso);
}

export function endOfMonth(iso: ISODate): ISODate {
  const d = fromISO(iso);
  return toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function monthName(index: number, long = true) {
  return long ? MONTHS_LONG[index] : MONTHS_SHORT[index];
}

/** "12 Feb 2027" (year omitted when it is the current year, unless forced). */
export function formatDate(iso: ISODate | null | undefined, opts: { year?: 'auto' | 'always' } = {}): string {
  if (!iso) return '';
  const d = fromISO(iso);
  const showYear = opts.year === 'always' || d.getFullYear() !== now().getFullYear();
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}${showYear ? ` ${d.getFullYear()}` : ''}`;
}

export function formatLongToday(): string {
  const d = now();
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

/** Human relative label: "Today", "Tomorrow", "in 5 days", "3 days ago". */
export function relativeLabel(iso: ISODate): string {
  const n = daysFromToday(iso);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1) {
    if (n < 45) return `in ${n} days`;
    if (n < 365) return `in ${Math.round(n / 30)} months`;
    const y = Math.round(n / 365);
    return `in ${y} year${y > 1 ? 's' : ''}`;
  }
  const a = -n;
  return a < 45 ? `${a} days ago` : `${Math.round(a / 30)} months ago`;
}

export function greeting(): string {
  const h = now().getHours();
  if (h < 5) return 'Good evening';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// ---------- Recurrence ----------

export const REPEAT_PRESETS: Record<Exclude<RepeatFrequency, 'custom'>, RepeatSpec> = {
  never: { frequency: 'never', interval: 0, unit: 'day' },
  daily: { frequency: 'daily', interval: 1, unit: 'day' },
  weekly: { frequency: 'weekly', interval: 1, unit: 'week' },
  monthly: { frequency: 'monthly', interval: 1, unit: 'month' },
  quarterly: { frequency: 'quarterly', interval: 3, unit: 'month' },
  half_yearly: { frequency: 'half_yearly', interval: 6, unit: 'month' },
  yearly: { frequency: 'yearly', interval: 1, unit: 'year' },
};

export const REPEAT_LABELS: Record<RepeatFrequency, string> = {
  never: 'Never',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Every 3 months',
  half_yearly: 'Every 6 months',
  yearly: 'Yearly',
  custom: 'Custom',
};

/** Picks the named frequency for an interval/unit pair, or 'custom'. */
export function specFor(interval: number, unit: RepeatUnit): RepeatSpec {
  for (const p of Object.values(REPEAT_PRESETS)) {
    if (p.frequency !== 'never' && p.interval === interval && p.unit === unit) return { ...p };
  }
  if (unit === 'month' && interval === 12) return { ...REPEAT_PRESETS.yearly };
  if (unit === 'day' && interval === 7) return { ...REPEAT_PRESETS.weekly };
  return { frequency: 'custom', interval, unit };
}

export function describeRepeat(spec: Pick<RepeatSpec, 'frequency' | 'interval' | 'unit'>): string {
  if (spec.frequency !== 'custom') return REPEAT_LABELS[spec.frequency];
  return `Every ${spec.interval} ${spec.unit}${spec.interval === 1 ? '' : 's'}`;
}

export function nextOccurrence(iso: ISODate, spec: Pick<RepeatSpec, 'interval' | 'unit'>): ISODate {
  return addUnit(iso, Math.max(1, spec.interval), spec.unit);
}

/**
 * Advances a due date past `after` (default today), so completing an overdue
 * monthly bill lands on the next future cycle rather than another past one.
 */
export function nextOccurrenceAfter(iso: ISODate, spec: Pick<RepeatSpec, 'interval' | 'unit'>, after: ISODate = todayISO()): ISODate {
  let next = nextOccurrence(iso, spec);
  let guard = 0;
  while (next <= after && guard++ < 1000) next = nextOccurrence(next, spec);
  return next;
}

/** All occurrences of a recurring item that fall within [from, to]. */
export function occurrencesBetween(
  start: ISODate,
  spec: Pick<RepeatSpec, 'interval' | 'unit'>,
  from: ISODate,
  to: ISODate,
): ISODate[] {
  const out: ISODate[] = [];
  let cur = start;
  let guard = 0;
  while (cur <= to && guard++ < 2000) {
    if (cur >= from) out.push(cur);
    cur = nextOccurrence(cur, spec);
  }
  return out;
}
