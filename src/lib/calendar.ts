import type { ISODate } from '../types';
import { occurrencesBetween } from './dates';
import type { LendingView, MemoryView } from './selectors';

export interface CalendarEvent {
  key: string;
  date: ISODate;
  title: string;
  kind: 'memory' | 'lending';
  memory?: MemoryView;
  lending?: LendingView;
  /** A projected future occurrence of a recurring item. */
  projected?: boolean;
}

/** Everything on the calendar between two dates, including future repeats. */
export function eventsBetween(memories: MemoryView[], lendings: LendingView[], from: ISODate, to: ISODate): Map<ISODate, CalendarEvent[]> {
  const map = new Map<ISODate, CalendarEvent[]>();
  const add = (e: CalendarEvent) => {
    const list = map.get(e.date);
    if (list) list.push(e);
    else map.set(e.date, [e]);
  };
  for (const m of memories) {
    if (m.status === 'archived' || !m.dueDate) continue;
    if (m.recurrence && m.recurrence.frequency !== 'never' && m.status === 'active') {
      for (const d of occurrencesBetween(m.dueDate, m.recurrence, from, to)) {
        add({ key: `${m.id}:${d}`, date: d, title: m.title, kind: 'memory', memory: m, projected: d !== m.dueDate });
      }
    } else if (m.dueDate >= from && m.dueDate <= to) {
      add({ key: m.id, date: m.dueDate, title: m.title, kind: 'memory', memory: m });
    }
  }
  for (const l of lendings) {
    if (l.status !== 'open' || !l.followUpDate) continue;
    if (l.followUpDate >= from && l.followUpDate <= to) {
      const who = l.person?.name ?? 'Someone';
      add({
        key: l.id,
        date: l.followUpDate,
        title: l.direction === 'lent' ? `Follow up with ${who}` : `Return to ${who}`,
        kind: 'lending',
        lending: l,
      });
    }
  }
  return map;
}
