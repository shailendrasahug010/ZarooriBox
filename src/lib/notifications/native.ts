import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { navigateTo } from '../appNavigation';
import { formatMoney } from '../format';
import { addDays, formatTime, timedDates, toISO } from '../dates';
import { t } from '../../i18n';
import type { ISODate, UserData, UserSettings } from '../../types';
import type { ChannelStatus, NotificationChannel } from './channels';

// Phone-app notifications. Unlike browser pop-ups, these are scheduled with the
// operating system, so they arrive at the chosen time even when ZarooriBox is closed.

/** iOS keeps at most 64 pending notifications per app; stay under it. */
const MAX_SCHEDULED = 60;
const HORIZON_DAYS = 60;

export interface PlannedLocalNotification {
  id: number;
  title: string;
  body: string;
  at: Date;
  /** What the Done / Tomorrow buttons on the notification act on. */
  target: { kind: 'memory' | 'lending'; id: string };
  /** 'reminder': a heads-up at the daily reminder time. 'timed': at a time set on the item (a dose, a meeting). */
  type: 'reminder' | 'timed';
}

/** Repeating items with times (daily medicines) are scheduled this many days ahead. */
const TIMED_REPEAT_DAYS = 7;

export { timedDates };

/** Buttons shown on every ZarooriBox reminder notification. */
export const ACTION_TYPE = 'zaroori-reminder';

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
    out.push({ id: notificationId(`r:${r.id}:${m.dueDate}:${r.remindOn}`), title: m.title, body: whenText(m.dueDate, r.remindOn), at, target: { kind: 'memory', id: m.id }, type: 'reminder' });
  }
  // Items with times of day: an alert at each time (every dose of a daily medicine, a meeting at 4 pm).
  const today = toISO(now);
  const recurrences = new Map(data.recurrences.map((r) => [r.memoryId, r]));
  for (const m of data.memories) {
    if (m.status !== 'active' || !m.dueDate || !m.dueTimes?.length) continue;
    const rec = recurrences.get(m.id) ?? null;
    const until = rec ? addDays(today, TIMED_REPEAT_DAYS) : toISO(horizon);
    const medicine = m.categoryId === 'health' && m.subcategory === 'Medicines';
    // Ticking off this morning's dose rolls a daily medicine to tomorrow; tonight's dose still counts.
    const doneToday = !!m.lastCompletedAt && toISO(new Date(m.lastCompletedAt)) === today;
    const start = rec && doneToday && m.dueDate > today ? today : m.dueDate;
    for (const d of timedDates(start, rec, today, until)) {
      for (const tm of m.dueTimes) {
        const at = atLocal(d, tm);
        if (at <= now || at > horizon) continue;
        out.push({
          id: notificationId(`t:${m.id}:${d}:${tm}`),
          title: medicine ? `💊 Time for ${m.title}` : m.title,
          body: medicine ? `Your ${formatTime(tm)} dose` : `At ${formatTime(tm)}${m.location ? ` · ${m.location}` : ''}`,
          at,
          target: { kind: 'memory', id: m.id },
          type: 'timed',
        });
      }
    }
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
    out.push({ id: notificationId(`l:${l.id}:${l.followUpDate}`), title: 'Time to follow up', body: what, at, target: { kind: 'lending', id: l.id }, type: 'reminder' });
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, MAX_SCHEDULED);
}

export const isNativeApp = () => Capacitor.isNativePlatform();

/**
 * Android shows a notification as a pop-up over the screen, with sound, only when its
 * channel is high importance. The plugin's default channel isn't, so alerts used to
 * arrive silently in the shade. Android never raises an existing channel's importance,
 * hence a new channel id.
 */
export const ALERT_CHANNEL = 'zaroori-alerts';
let channelReady: Promise<void> | null = null;

function ensureAlertChannel(): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return Promise.resolve();
  channelReady ??= LocalNotifications.createChannel({
    id: ALERT_CHANNEL,
    name: 'Reminders',
    description: 'Due dates, medicine doses and appointments',
    importance: 5,
    visibility: 1,
    vibration: true,
    lights: true,
    lightColor: '#0B5BD3',
  }).catch(() => {
    channelReady = null;
  });
  return channelReady;
}

const toStatus = (s: string): ChannelStatus => (s === 'granted' ? 'ready' : s === 'denied' ? 'blocked' : 'needs_permission');
let cachedStatus: ChannelStatus = 'needs_permission';

export const nativeChannel: NotificationChannel = {
  id: 'browser',
  label: 'Phone notifications',
  description: 'Alerts on this phone at your chosen time, even when ZarooriBox is closed.',
  status: () => cachedStatus,
  async requestAccess() {
    const r = await LocalNotifications.requestPermissions();
    cachedStatus = toStatus(r.display);
    return cachedStatus;
  },
  async send(p) {
    if (cachedStatus !== 'ready') return false;
    await ensureAlertChannel();
    await LocalNotifications.schedule({ notifications: [{ id: notificationId(`now:${p.tag ?? p.title}:${Date.now()}`), title: p.title, body: p.body, channelId: ALERT_CHANNEL }] });
    return true;
  },
};

/** A test alert a few seconds from now, so it can be seen popping up over another app. */
export async function scheduleTestNotification(seconds = 5) {
  await ensureAlertChannel();
  await LocalNotifications.schedule({
    notifications: [
      {
        id: notificationId(`test:${Date.now()}`),
        title: 'ZarooriBox test 👋',
        body: 'Reminders are working on this phone.',
        channelId: ALERT_CHANNEL,
        schedule: { at: new Date(Date.now() + seconds * 1000), allowWhileIdle: true },
      },
    ],
  });
}

/** Android 12+: whether "Alarms & reminders" is allowed, so alerts fire at the exact minute. */
export async function exactAlarmsAllowed(): Promise<boolean | null> {
  if (Capacitor.getPlatform() !== 'android') return null;
  const r = await LocalNotifications.checkExactNotificationSetting().catch(() => null);
  return r ? r.exact_alarm === 'granted' : null;
}

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

/** Replaces everything ZarooriBox has scheduled on this phone with the current plan. */
export async function syncNativeSchedule(data: UserData, settings: UserSettings): Promise<number> {
  if (!isNativeApp()) return 0;
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
  if (!settings.notifications.browser || (await refreshNativeStatus()) !== 'ready') return 0;
  const plan = planLocalNotifications(data, settings, new Date());
  if (plan.length) {
    await ensureAlertChannel();
    await LocalNotifications.schedule({
      notifications: plan.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        schedule: { at: n.at, allowWhileIdle: true },
        actionTypeId: ACTION_TYPE,
        channelId: ALERT_CHANNEL,
        extra: { kind: n.target.kind, id: n.target.id },
      })),
    });
  }
  return plan.length;
}

let actionsReady = false;

/**
 * Registers the Done / Tomorrow / Next week buttons and routes taps on them (and on
 * the notification itself) to /app/act, which runs the action once data has loaded.
 */
export async function listenForNotificationActions() {
  if (!isNativeApp() || actionsReady) return;
  actionsReady = true;
  try {
    await LocalNotifications.registerActionTypes({
      types: [
        {
          id: ACTION_TYPE,
          actions: [
            { id: 'done', title: t('act.done') },
            { id: 'tomorrow', title: t('act.tomorrow') },
            { id: 'week', title: t('act.week') },
          ],
        },
      ],
    });
  } catch {
    // Older devices without action buttons still get the notification.
  }
  await LocalNotifications.addListener('localNotificationActionPerformed', (e) => {
    const extra = (e.notification.extra ?? {}) as { kind?: string; id?: string };
    if ((extra.kind !== 'memory' && extra.kind !== 'lending') || !extra.id) {
      navigateTo('/app');
      return;
    }
    const action = ['done', 'tomorrow', 'week'].includes(e.actionId) ? e.actionId : 'open';
    navigateTo(`/app/act?kind=${extra.kind}&id=${encodeURIComponent(extra.id)}&do=${action}`);
  });
}
