import { Capacitor, registerPlugin } from '@capacitor/core';
import type { ISODate, UserData } from '../types';
import { dosesOn } from './medicines';
import { buildMemoryViews, dueToday } from './selectors';

// The Android home-screen widget ("ZarooriBox · Today") can't read the app's data
// itself, so the app hands it a short list whenever something changes. The widget
// shows that list until the app next runs.

export interface WidgetLine {
  /** "08:00", or '' for things due any time today. */
  time: string;
  title: string;
  overdue?: boolean;
  medicine?: boolean;
}

/** Today's medicine doses and reminders, timed ones first in time order. */
export function widgetLines(data: UserData, today: ISODate): WidgetLine[] {
  const lines: WidgetLine[] = dosesOn(data.memories, data.recurrences, today).map((d) => ({ time: d.time, title: d.title, medicine: true }));
  for (const m of dueToday(buildMemoryViews(data))) {
    lines.push({ time: m.dueTimes?.[0] ?? '', title: m.title, overdue: (m.daysLeft ?? 0) < 0 });
  }
  const rank = (l: WidgetLine) => (l.overdue ? 0 : l.time ? 1 : 2);
  return lines.sort((a, b) => rank(a) - rank(b) || a.time.localeCompare(b.time) || a.title.localeCompare(b.title));
}

interface WidgetPlugin {
  update(options: { lines: string; day: string }): Promise<void>;
}

const Widget = registerPlugin<WidgetPlugin>('ZarooriWidget');
let last = '';

/** Sends today's list to the widget (Android app only; does nothing elsewhere). */
export function syncWidget(data: UserData, today: ISODate) {
  if (Capacitor.getPlatform() !== 'android') return;
  const lines = JSON.stringify(widgetLines(data, today).slice(0, 20));
  const key = `${today}|${lines}`;
  if (key === last) return;
  last = key;
  Widget.update({ lines, day: today }).catch(() => {
    last = '';
  });
}
