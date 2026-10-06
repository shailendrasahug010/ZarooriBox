import type { Attachment, ISODate, Lending, Memory, Person, RecurringItem, Reminder, UserData } from '../types';
import { EXPIRY_SUBCATEGORIES } from './categories';
import { daysFromToday, todayISO } from './dates';

export type Urgency = 'attention' | 'soon' | 'ok' | 'none';

/** Items due within this many days count as "coming soon". */
export const SOON_WINDOW = 30;
/** The Expiry Radar looks this far ahead. */
export const RADAR_WINDOW = 120;

export interface MemoryView extends Memory {
  reminder?: Reminder;
  recurrence?: RecurringItem;
  person?: Person;
  attachments: Attachment[];
  daysLeft: number | null;
  urgency: Urgency;
  isExpiry: boolean;
}

export interface LendingView extends Lending {
  person?: Person;
  urgency: Urgency;
}

export function urgencyFor(date: ISODate | null | undefined, window = SOON_WINDOW): Urgency {
  if (!date) return 'none';
  const n = daysFromToday(date);
  if (n <= 0) return 'attention';
  if (n <= window) return 'soon';
  return 'ok';
}

export function isExpiryItem(m: Pick<Memory, 'categoryId' | 'subcategory' | 'title'>): boolean {
  return (
    m.categoryId === 'documents' ||
    (!!m.subcategory && EXPIRY_SUBCATEGORIES.has(m.subcategory)) ||
    /\b(expir|renew|warranty|insurance|subscription|valid)/i.test(m.title)
  );
}

function groupBy<T, K extends string>(rows: T[], key: (r: T) => K | null | undefined): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const r of rows) {
    const k = key(r);
    if (k == null) continue;
    const list = map.get(k);
    if (list) list.push(r);
    else map.set(k, [r]);
  }
  return map;
}

export function buildMemoryViews(data: UserData): MemoryView[] {
  const reminders = groupBy(data.reminders, (r) => r.memoryId);
  const recurrences = groupBy(data.recurrences, (r) => r.memoryId);
  const attachments = groupBy(data.attachments, (a) => a.memoryId);
  const people = new Map(data.people.map((p) => [p.id, p]));
  return data.memories.map((m) => {
    const active = m.status === 'active';
    return {
      ...m,
      reminder: reminders.get(m.id)?.[0],
      recurrence: recurrences.get(m.id)?.[0],
      person: m.personId ? people.get(m.personId) : undefined,
      attachments: attachments.get(m.id) ?? [],
      daysLeft: m.dueDate ? daysFromToday(m.dueDate) : null,
      urgency: active ? urgencyFor(m.dueDate) : 'none',
      isExpiry: isExpiryItem(m),
    };
  });
}

export function buildLendingViews(data: UserData): LendingView[] {
  const people = new Map(data.people.map((p) => [p.id, p]));
  return data.lendings.map((l) => ({
    ...l,
    person: people.get(l.personId),
    urgency: l.status === 'open' ? urgencyFor(l.followUpDate, 7) : 'none',
  }));
}

const byDue = (a: MemoryView, b: MemoryView) =>
  (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31') || a.title.localeCompare(b.title);

export const active = (v: MemoryView[]) => v.filter((m) => m.status === 'active');

export function dueToday(views: MemoryView[]) {
  return active(views).filter((m) => m.daysLeft != null && m.daysLeft <= 0).sort(byDue);
}

export function comingSoon(views: MemoryView[], window = SOON_WINDOW) {
  return active(views)
    .filter((m) => m.daysLeft != null && m.daysLeft > 0 && m.daysLeft <= window)
    .sort(byDue);
}

export function expiringSoon(views: MemoryView[], window = RADAR_WINDOW) {
  return active(views)
    .filter((m) => m.isExpiry && m.daysLeft != null && m.daysLeft <= window)
    .sort(byDue);
}

export function recentlyAdded(views: MemoryView[], n = 5) {
  return [...views]
    .filter((m) => m.status !== 'archived')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, n);
}

export function sortByDue(views: MemoryView[]) {
  return [...views].sort(byDue);
}

export type OverallStatus = 'attention' | 'soon' | 'ok';

export function overallStatus(views: MemoryView[], lendings: LendingView[]): OverallStatus {
  if (dueToday(views).length || lendings.some((l) => l.urgency === 'attention')) return 'attention';
  if (comingSoon(views, 7).length) return 'soon';
  return 'ok';
}

export type UpcomingBucket = 'Overdue' | 'Today' | 'This week' | 'This month' | 'Later' | 'No date';

export function bucketFor(m: MemoryView): UpcomingBucket {
  if (m.daysLeft == null) return 'No date';
  if (m.daysLeft < 0) return 'Overdue';
  if (m.daysLeft === 0) return 'Today';
  if (m.daysLeft <= 7) return 'This week';
  if (m.daysLeft <= 31) return 'This month';
  return 'Later';
}

export const BUCKET_ORDER: UpcomingBucket[] = ['Overdue', 'Today', 'This week', 'This month', 'Later', 'No date'];

export function isToday(iso: ISODate) {
  return iso === todayISO();
}
