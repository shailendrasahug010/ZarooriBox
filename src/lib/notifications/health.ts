import { Capacitor, registerPlugin } from '@capacitor/core';
import { ALERT_CHANNEL, ensureAlertChannel } from './native';

// "Pop-up check": the phone settings that decide whether a reminder pops up at
// the right minute. Android phones from Xiaomi, Oppo, Vivo and others also hold
// back apps that aren't on their battery or autostart lists, which no app can
// change by itself, so the check explains each one and opens the right screen.

export interface ReminderHealth {
  notificationsOn: boolean;
  /** Android channel importance; 4 or more pops up on screen. -1 when not made yet. */
  channelImportance: number;
  exactAlarms: boolean;
  batteryUnrestricted: boolean;
  manufacturer: string;
  sdk: number;
}

interface DevicePlugin {
  reminderHealth(o: { channel: string }): Promise<ReminderHealth>;
  openNotificationSettings(o: { channel?: string }): Promise<void>;
  openBatterySettings(): Promise<void>;
  openAutostartSettings(): Promise<void>;
}

const Device = registerPlugin<DevicePlugin>('ZarooriDevice');

/** Phone makers whose battery savers stop reminders unless the app is allowed to run. */
const STRICT_MAKERS = ['xiaomi', 'redmi', 'poco', 'oppo', 'realme', 'oneplus', 'vivo', 'iqoo', 'huawei', 'honor', 'samsung', 'tecno', 'infinix'];
/** Makers with a separate "Autostart" switch. */
const AUTOSTART_MAKERS = ['xiaomi', 'redmi', 'poco', 'oppo', 'realme', 'vivo', 'iqoo', 'huawei', 'honor'];

export type CheckId = 'notifications' | 'popup' | 'exact' | 'battery' | 'autostart';
export interface Check {
  id: CheckId;
  /** true: fine; false: needs fixing; null: can't be read, so the person checks it. */
  ok: boolean | null;
}

/** What to show, in the order to fix it. */
export function reminderChecks(h: ReminderHealth): Check[] {
  const maker = h.manufacturer.toLowerCase();
  const out: Check[] = [
    { id: 'notifications', ok: h.notificationsOn },
    { id: 'popup', ok: h.channelImportance < 0 ? null : h.channelImportance >= 4 },
    { id: 'exact', ok: h.exactAlarms },
    // Stock Android (Pixel, Motorola, Nokia) still rings exact alarms when the battery saver is on.
    { id: 'battery', ok: h.batteryUnrestricted || !STRICT_MAKERS.includes(maker) },
  ];
  if (AUTOSTART_MAKERS.includes(maker)) out.push({ id: 'autostart', ok: null });
  return out;
}

/** Android app only; null elsewhere. */
export async function readReminderHealth(): Promise<ReminderHealth | null> {
  if (Capacitor.getPlatform() !== 'android') return null;
  // Make the Reminders channel first, so its pop-up setting can be read.
  await ensureAlertChannel();
  return Device.reminderHealth({ channel: ALERT_CHANNEL }).catch(() => null);
}

export const openNotificationSettings = (channel?: string) => Device.openNotificationSettings({ channel }).catch(() => undefined);
export const openBatterySettings = () => Device.openBatterySettings().catch(() => undefined);
export const openAutostartSettings = () => Device.openAutostartSettings().catch(() => undefined);
