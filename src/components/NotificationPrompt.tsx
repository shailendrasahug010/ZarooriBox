import { useEffect, useState } from 'react';
import { BellRing } from 'lucide-react';
import { allowFromPrompt, openExactAlarmSetting, prepareNotifications, snoozeAsk, type StartupNeed } from '../lib/notifications/startup';
import { useStore } from '../store/DataProvider';
import { Modal } from './Modal';
import { useToast } from './Toast';

/** Asks for notification permission when the app opens (see lib/notifications/startup.ts). */
export function NotificationPrompt() {
  const store = useStore();
  const toast = useToast();
  const [need, setNeed] = useState<StartupNeed>('none');

  useEffect(() => {
    let live = true;
    // A moment after opening, so the screen has drawn before a prompt appears.
    const t = window.setTimeout(() => {
      void prepareNotifications(store)
        .then((n) => live && setNeed(n))
        .catch(() => {});
    }, 800);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [store]);

  if (need === 'none') return null;
  const later = () => {
    snoozeAsk(store.uid, need);
    setNeed('none');
  };
  const exact = need === 'exact_alarms';

  return (
    <Modal
      open
      onClose={later}
      title={
        <span className="flex items-center gap-2">
          <BellRing className="size-5 text-brand-600" aria-hidden="true" /> {exact ? 'Get reminders on time' : 'Turn on reminders?'}
        </span>
      }
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={later}>
            Not now
          </button>
          <button
            type="button"
            className="btn btn-primary"
            data-autofocus
            onClick={async () => {
              if (exact) {
                setNeed('none');
                await openExactAlarmSetting();
                return;
              }
              const ok = await allowFromPrompt(store);
              setNeed('none');
              if (ok) toast.success('Reminders are on');
              else toast.error('Notifications are blocked. Allow them in your browser’s site settings.');
            }}
          >
            {exact ? 'Open setting' : 'Allow'}
          </button>
        </div>
      }
    >
      <p className="text-ink-soft">
        {exact
          ? 'To alert you at the exact time of a medicine dose, meeting or bill, Android needs “Alarms & reminders” turned on for ZarooriBox. Tap Open setting and switch it on.'
          : 'ZarooriBox can pop up an alert when a bill, renewal, medicine or appointment is due.'}
      </p>
    </Modal>
  );
}
