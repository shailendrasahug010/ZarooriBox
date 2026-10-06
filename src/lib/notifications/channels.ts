import type { NotificationChannelId } from '../../types';

export interface NotificationPayload {
  title: string;
  body: string;
  /** Collapses duplicates on the OS level. */
  tag?: string;
  url?: string;
}

export type ChannelStatus = 'ready' | 'needs_permission' | 'blocked' | 'unsupported' | 'coming_soon';

/**
 * A delivery channel. Browser notifications run on-device today. Email, WhatsApp
 * and SMS must be sent from a server (see supabase/functions/send-reminders),
 * so in the client they only describe themselves.
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
  status: () => 'coming_soon',
  async send() {
    return false;
  },
});

export const CHANNELS: NotificationChannel[] = [
  browserChannel,
  serverChannel('email', 'Email', 'A short email on the day and before important renewals.'),
  serverChannel('whatsapp', 'WhatsApp', 'Reminders on WhatsApp, where you already are.', true),
  serverChannel('sms', 'SMS', 'Text messages for the things you really can’t miss.', true),
];
