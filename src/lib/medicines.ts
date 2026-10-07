import type { ID, ISODate, Memory, RecurringItem } from '../types';
import { timedDates, toISO } from './dates';

export const isMedicine = (m: Pick<Memory, 'categoryId' | 'subcategory'>) => m.categoryId === 'health' && m.subcategory === 'Medicines';

export interface Dose {
  memoryId: ID;
  title: string;
  time: string;
  /** "<memoryId>@<HH:mm>", unique within a day. */
  key: string;
}

/** Today's doses of every active medicine, in time order. */
export function dosesOn(memories: Memory[], recurrences: RecurringItem[], day: ISODate): Dose[] {
  const recs = new Map(recurrences.map((r) => [r.memoryId, r]));
  const out: Dose[] = [];
  for (const m of memories) {
    if (!isMedicine(m) || m.status !== 'active' || !m.dueDate || !m.dueTimes?.length) continue;
    const rec = recs.get(m.id) ?? null;
    // Ticking off a daily medicine rolls it to tomorrow; today's doses still show.
    const doneToday = !!m.lastCompletedAt && toISO(new Date(m.lastCompletedAt)) === day;
    const start = rec && doneToday && m.dueDate > day ? day : m.dueDate;
    if (!timedDates(start, rec, day, day).length) continue;
    for (const time of m.dueTimes) out.push({ memoryId: m.id, title: m.title, time, key: `${m.id}@${time}` });
  }
  return out.sort((a, b) => a.time.localeCompare(b.time) || a.title.localeCompare(b.title));
}

// Without a cloud account, which doses were taken is kept on this device, one small list per day.
const key = (uid: ID, day: ISODate) => `zaroori:v1:doses:${uid}:${day}`;

export function readTaken(uid: ID, day: ISODate): Set<string> {
  try {
    return new Set(JSON.parse(globalThis.localStorage?.getItem(key(uid, day)) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

export function writeTaken(uid: ID, day: ISODate, taken: Set<string>) {
  try {
    globalThis.localStorage?.setItem(key(uid, day), JSON.stringify([...taken]));
  } catch {
    /* best effort */
  }
}

export function clearTaken(uid: ID, day: ISODate) {
  try {
    globalThis.localStorage?.removeItem(key(uid, day));
  } catch {
    /* best effort */
  }
}
