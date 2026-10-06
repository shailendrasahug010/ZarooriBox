import { getSupabase, isSupabaseConfigured } from '../../data/supabase';
import type { NotificationChannelId } from '../../types';
import { t } from '../../i18n';
import { isNativeApp, nativeChannel } from './native';

export interface NotificationPayload {
  title: string;
  body: string;
  /** Collapses duplicates on the OS level. */
  tag?: string;
  url?: string;
  /** Adds Done / Tomorrow buttons (where the browser supports them). */
  target?: { kind: 'memory' | 'lending'; id: string };
}

/** server: delivered by LifeBox's servers. needs_cloud: needs a cloud (Supabase) account; the local-only version has no server. */
export type ChannelStatus = 'ready' | 'needs_permission' | 'blocked' | 'unsupported' | 'server' | 'needs_cloud';

/**
 * A delivery channel. Browser notifications run on-device. Email, WhatsApp and SMS
 * are sent by the send-reminders server function at each person's chosen time, so
 * in the client they are preferences plus a "send me a test" call.
 */
export interface NotificationChannel {
  id: NotificationChannelId;
  label: string;
  description: string;
  pro?: boolean;
  status(): ChannelStatus;
  requestAccess?(): Promise<ChannelStatus>;
  send(p: NotificationPayload): Promise<boolean>;
}

export const browserChannel: NotificationChannel = {
  id: 'browser',
  label: 'Browser notifications',
  description: 'A pop-up on this device when something is due, while LifeBox is open.',
  status() {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'granted') return 'ready';
    if (Notification.permission === 'denied') return 'blocked';
    return 'needs_permission';
  },
  async requestAccess() {
    if (!('Notification' in window)) return 'unsupported';
    const r = await Notification.requestPermission();
    return r === 'granted' ? 'ready' : r === 'denied' ? 'blocked' : 'needs_permission';
  },
  async send(p) {
    if (this.status() !== 'ready') return false;
    // Through the service worker, notifications can carry buttons and work after the tab closes.
    try {
      const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
      if (reg?.active) {
        await reg.showNotification(p.title, {
          body: p.body,
          tag: p.tag,
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          data: { url: p.url ?? '/app', target: p.target ?? null },
          ...(p.target ? { actions: [{ action: 'done', title: t('act.done') }, { action: 'tomorrow', title: t('act.tomorrow') }] } : {}),
        } as NotificationOptions);
        return true;
      }
    } catch {
      // Fall back to a plain notification below.
    }
    try {
      const n = new Notification(p.title, { body: p.body, tag: p.tag, icon: '/favicon.svg' });
      n.onclick = () => {
        window.focus();
        if (p.url) window.location.assign(p.url);
      };
      return true;
    } catch {
      return false;
    }
  },
};

const serverChannel = (id: NotificationChannelId, label: string, description: string, pro = false): NotificationChannel => ({
  id,
  label,
  description,
  pro,
  status: () => (isSupabaseConfigured ? 'server' : 'needs_cloud'),
  async send() {
    return false;
  },
});

export type TestResults = Partial<Record<'email' | 'whatsapp' | 'sms', { ok: boolean; error?: string }>>;

/** Asks the server to send a test message on each channel the person switched on. */
export async function sendServerTest(): Promise<TestResults> {
  const { data, error } = await getSupabase().functions.invoke('send-reminders', { body: { test: true } });
  if (error) {
    let message = 'Could not reach the reminder service.';
    try {
      const body = await (error as { context?: Response }).context?.json();
      if (body?.error) message = body.error;
    } catch {
      /* keep the generic message */
    }
    throw new Error(message);
  }
  return (data?.results ?? {}) as TestResults;
}

/** Pop-ups on this device: OS-scheduled in the phone app, browser notifications on the web. */
export const deviceChannel: NotificationChannel = isNativeApp() ? nativeChannel : browserChannel;

export const CHANNELS: NotificationChannel[] = [
  deviceChannel,
  serverChannel('email', 'Email', 'A short email at your chosen time when something is due.'),
  serverChannel('whatsapp', 'WhatsApp', 'Reminders on WhatsApp, where you already are.', true),
  serverChannel('sms', 'SMS', 'Text messages for the things you really can’t miss.', true),
];
