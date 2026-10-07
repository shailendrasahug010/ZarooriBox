import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { ZarooriStore } from '../../store/ZarooriStore';
import { deviceChannel } from './channels';
import { isNativeApp } from './native';

// Asking for notifications when ZarooriBox opens. Before this, phone alerts only
// worked after someone found the switch in Settings, so most people never got any.

/** What still needs the person: nothing, a tap to allow (web), or Android's alarm setting. */
export type StartupNeed = 'none' | 'allow' | 'exact_alarms';

const key = (uid: string, what: string) => `zaroori:v1:notify-${what}:${uid}`;
const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode: we'll just ask again next time */
  }
};

/** "Not now" is remembered for a week, so the question doesn't nag on every launch. */
export function snoozeAsk(uid: string, what: StartupNeed) {
  write(key(uid, `later-${what}`), String(Date.now()));
}
const askedRecently = (uid: string, what: StartupNeed) => Date.now() - Number(read(key(uid, `later-${what}`)) ?? 0) < 7 * 86_400_000;

/**
 * Turns on alerts once permission is granted. Done once per person and device, so a
 * deliberate "off" in Settings later stays off.
 */
async function switchOn(store: ZarooriStore) {
  const s = store.settings;
  if (s.notifications.browser || read(key(store.uid, 'auto-on'))) return;
  write(key(store.uid, 'auto-on'), '1');
  await store.updateSettings({ notifications: { ...s.notifications, browser: true } });
}

/**
 * Runs when the app opens. On the phone it shows the system permission prompt
 * straight away; a browser only allows that after a tap, so it returns 'allow'
 * for the app to ask with a button.
 */
export async function prepareNotifications(store: ZarooriStore): Promise<StartupNeed> {
  if (store.user.isDemo) return 'none';
  if (isNativeApp()) {
    let state = (await LocalNotifications.checkPermissions()).display;
    if (state === 'prompt' || state === 'prompt-with-rationale') state = (await LocalNotifications.requestPermissions()).display;
    await deviceChannel.requestAccess?.().catch(() => undefined);
    if (state !== 'granted') return 'none';
    await switchOn(store);
    // Android 12+: without "Alarms & reminders", alerts can arrive late or in a batch.
    if (Capacitor.getPlatform() === 'android' && !askedRecently(store.uid, 'exact_alarms')) {
      const exact = await LocalNotifications.checkExactNotificationSetting().catch(() => null);
      if (exact && exact.exact_alarm !== 'granted') return 'exact_alarms';
    }
    return 'none';
  }
  const status = deviceChannel.status();
  if (status === 'ready') {
    await switchOn(store);
    return 'none';
  }
  return status === 'needs_permission' && !askedRecently(store.uid, 'allow') ? 'allow' : 'none';
}

/** The "Allow" button on the web prompt. */
export async function allowFromPrompt(store: ZarooriStore): Promise<boolean> {
  const s = (await deviceChannel.requestAccess?.()) ?? 'unsupported';
  if (s !== 'ready') return false;
  await switchOn(store);
  return true;
}

export async function openExactAlarmSetting() {
  await LocalNotifications.changeExactNotificationSetting().catch(() => undefined);
}
