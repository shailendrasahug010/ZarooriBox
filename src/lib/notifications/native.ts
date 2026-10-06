import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { formatMoney } from '../format';
import type { ISODate, UserData, UserSettings } from '../../types';
import type { ChannelStatus, NotificationChannel } from './channels';

// Phone-app notifications. Unlike browser pop-ups, these are scheduled with the
// operating system, so they arrive at the chosen time even when LifeBox is closed.

/** iOS keeps at most 64 pending notifications per app; stay under it. */
const MAX_SCHEDULED = 60;
const HORIZON_DAYS = 60;

export interface PlannedLocalNotification {
  id: number;
  title: string;
  body: string;
  at: Date;
}

/** Stable 31-bit id from a string, so rescheduling replaces rather than duplicates. */
export function notificationId(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return (h >>> 1) || 1;
}

function atLocal(date: ISODate, hhmm: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = (/^\d{2}:\d{2}$/.test(hhmm) ? hhmm : '08:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

function whenText(due: ISODate, on: ISODate): string {
  const days = Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${on}T00:00:00Z`)) / 86_400_000);
  return days <= 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : `Due in ${days} days`;
}

/** Future notifications for reminders and lending follow-ups, soonest first. */
export function planLocalNotifications(data: UserData, settings: UserSettings, now: Date): PlannedLocalNotification[] {
  const time = settings.notifications.digestTime;
  const horizon = new Date(now.getTime() + HORIZON_DAYS * 86_400_000);
  const memories = new Map(data.memories.map((m) => [m.id, m]));
  const people = new Map(data.people.map((p) => [p.id, p.name]));
  const out: PlannedLocalNotification[] = [];

  for (const r of data.reminders) {
    const m = memories.get(r.memoryId);
    if (!m || m.status !== 'active' || !m.dueDate) continue;
    const at = atLocal(r.remindOn, time);
    if (at <= now || at > horizon) continue;
    out.push({ id: notificationId(`r:${r.id}:${m.dueDate}`), title: m.title, body: whenText(m.dueDate, r.remindOn), at });
  }
  for (const l of data.lendings) {
    if (l.status !== 'open' || !l.followUpDate) continue;
    const at = atLocal(l.followUpDate, time);
    if (at <= now || at > horizon) continue;
    const who = people.get(l.personId) ?? 'Someone';
    const what =
      l.kind === 'money'
        ? l.direction === 'lent'
          ? `${who} owes you ${formatMoney(l.amount ?? 0, l.currency)}`
          : `Pay ${who} back ${formatMoney(l.amount ?? 0, l.currency)}`
        : l.direction === 'lent'
          ? `${who} has your ${l.itemName ?? 'item'}`
          : `Return the ${l.itemName ?? 'item'} to ${who}`;
    out.push({ id: notificationId(`l:${l.id}:${l.followUpDate}`), title: 'Time to follow up', body: what, at });
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, MAX_SCHEDULED);
}

export const isNativeApp = () => Capacitor.isNativePlatform();

const toStatus = (s: string): ChannelStatus => (s === 'granted' ? 'ready' : s === 'denied' ? 'blocked' : 'needs_permission');
let cachedStatus: ChannelStatus = 'needs_permission';

export const nativeChannel: NotificationChannel = {
  id: 'browser',
  label: 'Phone notifications',
  description: 'Alerts on this phone at your chosen time, even when LifeBox is closed.',
  status: () => cachedStatus,
  async requestAccess() {
    const r = await LocalNotifications.requestPermissions();
    cachedStatus = toStatus(r.display);
    return cachedStatus;
  },
  async send(p) {
    if (cachedStatus !== 'ready') return false;
    await LocalNotifications.schedule({ notifications: [{ id: notificationId(`now:${p.tag ?? p.title}:${Date.now()}`), title: p.title, body: p.body }] });
    return true;
  },
};

/** Reads the real permission state once at startup (the plugin call is async). */
export async function refreshNativeStatus(): Promise<ChannelStatus> {
  if (!isNativeApp()) return cachedStatus;
  try {
    cachedStatus = toStatus((await LocalNotifications.checkPermissions()).display);
  } catch {
    cachedStatus = 'unsupported';
  }
  return cachedStatus;
}

/** Replaces everything LifeBox has scheduled on this phone with the current plan. */
export async function syncNativeSchedule(data: UserData, settings: UserSettings): Promise<number> {
  if (!isNativeApp()) return 0;
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
  if (!settings.notifications.browser || (await refreshNativeStatus()) !== 'ready') return 0;
  const plan = planLocalNotifications(data, settings, new Date());
  if (plan.length) {
    await LocalNotifications.schedule({
      notifications: plan.map((n) => ({ id: n.id, title: n.title, body: n.body, schedule: { at: n.at, allowWhileIdle: true }, extra: { url: '/app' } })),
    });
  }
  return plan.length;
}
