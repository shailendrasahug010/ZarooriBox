import type { AppNotification, ID, ISODate, Reminder, UserData } from '../../types';
import { formatDate, relativeLabel, todayISO } from '../dates';
import { formatMoney } from '../format';

export interface DueReminder {
  reminder?: Reminder;
  lendingId?: ID;
  memoryId?: ID;
  dueDate: ISODate;
  title: string;
  body: string;
}

/**
 * Finds reminders that should fire now. Each reminder fires once per due date
 * (tracked in notifiedFor), so recurring items notify again next cycle.
 */
export function collectDueReminders(data: UserData, today: ISODate = todayISO()): DueReminder[] {
  const out: DueReminder[] = [];
  const memories = new Map(data.memories.map((m) => [m.id, m]));
  for (const r of data.reminders) {
    const m = memories.get(r.memoryId);
    if (!m || m.status !== 'active' || !m.dueDate) continue;
    if (r.remindOn > today || r.notifiedFor === m.dueDate) continue;
    const when = relativeLabel(m.dueDate);
    out.push({
      reminder: r,
      memoryId: m.id,
      dueDate: m.dueDate,
      title: m.title,
      body:
        m.dueDate < today
          ? `Was due ${formatDate(m.dueDate)}. Still on your list.`
          : `${when === 'Today' ? 'Due today' : `Due ${when}`} · ${formatDate(m.dueDate)}${m.amount ? ` · ${formatMoney(m.amount, m.currency)}` : ''}`,
    });
  }
  const people = new Map(data.people.map((p) => [p.id, p]));
  for (const l of data.lendings) {
    if (l.status !== 'open' || !l.followUpDate || l.followUpDate > today) continue;
    if (l.lastReminderAt && l.lastReminderAt.slice(0, 10) >= l.followUpDate) continue;
    const name = people.get(l.personId)?.name ?? 'Someone';
    const what = l.kind === 'money' ? formatMoney(l.amount, l.currency) : l.itemName ?? 'something';
    out.push({
      lendingId: l.id,
      dueDate: l.followUpDate,
      title: l.direction === 'lent' ? `Follow up with ${name}` : `Return to ${name}`,
      body: l.direction === 'lent' ? `${name} still has your ${what}.` : `You borrowed ${what} from ${name}.`,
    });
  }
  return out;
}

export function toNotification(d: DueReminder, userId: ID, id: ID): AppNotification {
  return {
    id,
    userId,
    memoryId: d.memoryId ?? null,
    lendingId: d.lendingId ?? null,
    title: d.title,
    body: d.body,
    channel: 'in_app',
    createdAt: new Date().toISOString(),
    readAt: null,
  };
}
