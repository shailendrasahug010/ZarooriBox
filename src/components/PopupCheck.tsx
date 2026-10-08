import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, HelpCircle } from 'lucide-react';
import { ALERT_CHANNEL } from '../lib/notifications/native';
import { openExactAlarmSetting } from '../lib/notifications/startup';
import {
  openAutostartSettings,
  openBatterySettings,
  openNotificationSettings,
  readReminderHealth,
  reminderChecks,
  type Check,
  type CheckId,
  type ReminderHealth,
} from '../lib/notifications/health';

const XIAOMI = ['xiaomi', 'redmi', 'poco'];

function copy(id: CheckId, maker: string): { title: string; fix: string; action: string; open: () => unknown } {
  switch (id) {
    case 'notifications':
      return { title: 'Notifications allowed', fix: 'Notifications are turned off for ZarooriBox.', action: 'Turn on', open: () => openNotificationSettings() };
    case 'popup':
      return {
        title: 'Pops up on the screen',
        fix: XIAOMI.includes(maker)
          ? 'Turn on “Floating notifications” and “Lock screen notifications” for Reminders.'
          : 'Turn on “Pop on screen” (or “Floating notifications”) for Reminders.',
        action: 'Open',
        open: () => openNotificationSettings(ALERT_CHANNEL),
      };
    case 'exact':
      return { title: 'Rings at the exact minute', fix: 'Allow “Alarms & reminders” for ZarooriBox.', action: 'Allow', open: openExactAlarmSetting };
    case 'battery':
      return {
        title: 'Battery saver won’t hold it back',
        fix: 'Open App info › Battery and choose “Unrestricted” (or “No restrictions”).',
        action: 'Open',
        open: openBatterySettings,
      };
    case 'autostart':
      return { title: 'Allowed to start in the background', fix: 'Turn on “Autostart” for ZarooriBox.', action: 'Open', open: openAutostartSettings };
  }
}

function Row({ check, maker }: { check: Check; maker: string }) {
  const c = copy(check.id, maker);
  const Icon = check.ok ? CheckCircle2 : check.ok === false ? AlertTriangle : HelpCircle;
  return (
    <li className="flex items-start gap-3 py-2.5">
      <Icon className={check.ok ? 'mt-0.5 size-5 shrink-0 text-ok' : check.ok === false ? 'mt-0.5 size-5 shrink-0 text-attn' : 'mt-0.5 size-5 shrink-0 text-soon'} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink">
          {c.title}
          <span className="sr-only">{check.ok ? ': yes' : check.ok === false ? ': needs fixing' : ': please check'}</span>
        </p>
        {!check.ok && <p className="text-sm text-muted">{c.fix}</p>}
      </div>
      {!check.ok && (
        <button type="button" className="btn btn-secondary btn-sm shrink-0" onClick={() => void c.open()}>
          {c.action}
        </button>
      )}
    </li>
  );
}

/** Android: which phone settings could make reminders late or silent, each with a fix button. */
export function PopupCheck() {
  const [health, setHealth] = useState<ReminderHealth | null>(null);
  useEffect(() => {
    const read = () => void readReminderHealth().then(setHealth);
    read();
    // Coming back from a settings screen.
    const onVisible = () => document.visibilityState === 'visible' && read();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
  if (!health) return null;
  const checks = reminderChecks(health);
  const allOk = checks.every((c) => c.ok);
  return (
    <section aria-labelledby="popup-check" className="mt-4 rounded-2xl bg-paper p-4">
      <h3 id="popup-check" className="font-bold text-ink">
        Pop-up check
      </h3>
      <p className="text-sm text-muted">
        {allOk ? 'This phone is set up to pop up reminders on time.' : 'Fix these so reminders pop up on time, even when ZarooriBox is closed.'}
      </p>
      <ul className="mt-1 divide-y divide-line">
        {checks.map((c) => (
          <Row key={c.id} check={c} maker={health.manufacturer} />
        ))}
      </ul>
    </section>
  );
}
