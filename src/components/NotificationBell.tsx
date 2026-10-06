import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlarmClock, Bell, BellRing, Check } from 'lucide-react';
import { useT, type Vars } from '../i18n';
import type { MessageKey } from '../i18n';
import type { AppNotification } from '../types';
import { useToast } from './Toast';
import { useData, useStore } from '../store/DataProvider';
import { Modal } from './Modal';
import { useUI } from './UIProvider';
import { EmptyState, cx } from './ui';

function timeAgo(iso: string, t: (k: MessageKey, v?: Vars) => string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return t('bell.justNow');
  if (s < 3600) return t('bell.minAgo', { n: Math.floor(s / 60) });
  if (s < 86400) return t('bell.hAgo', { n: Math.floor(s / 3600) });
  return t('bell.dAgo', { n: Math.floor(s / 86400) });
}

/** Done / Tomorrow right in the list, for reminders that are still open. */
function QuickActions({ n }: { n: AppNotification }) {
  const store = useStore();
  const data = useData();
  const toast = useToast();
  const t = useT();
  const target = n.memoryId ? { kind: 'memory' as const, id: n.memoryId } : n.lendingId ? { kind: 'lending' as const, id: n.lendingId } : null;
  const open =
    target?.kind === 'memory'
      ? data.memories.some((m) => m.id === target.id && m.status === 'active')
      : target?.kind === 'lending'
        ? data.lendings.some((l) => l.id === target.id && l.status === 'open')
        : false;
  if (!target || !open) return null;
  const run = (action: 'done' | 'tomorrow') =>
    store
      .act(target, action)
      .then((msg) => toast.success(msg))
      .catch((e: Error) => toast.error(e.message));
  return (
    <span className="mt-2 flex gap-2">
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => run('done')}>
        <Check className="size-4" /> {t('act.done')}
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => run('tomorrow')}>
        <AlarmClock className="size-4" /> {t('act.tomorrow')}
      </button>
    </span>
  );
}

export function NotificationBell() {
  const data = useData();
  const store = useStore();
  const { openMemory } = useUI();
  const [open, setOpen] = useState(false);
  const t = useT();
  const unread = data.notifications.filter((n) => !n.readAt).length;
  const list = [...data.notifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const close = () => {
    setOpen(false);
    store.markNotificationsRead().catch(() => {});
  };

  return (
    <>
      <button
        type="button"
        className="icon-btn relative"
        aria-label={unread ? t('bell.unread', { n: unread }) : t('bell.title')}
        onClick={() => setOpen(true)}
      >
        {unread ? <BellRing className="size-5" /> : <Bell className="size-5" />}
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 grid min-w-[1.15rem] place-items-center rounded-full bg-attn-dot px-1 text-[0.68rem] font-bold leading-[1.15rem] text-white animate-pop">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      <Modal
        open={open}
        onClose={close}
        title={t('bell.title')}
        footer={
          list.length > 0 ? (
            <div className="flex items-center justify-between">
              <Link to="/app/settings#notifications" onClick={close} className="text-sm font-semibold text-brand-700">
                {t('bell.settings')}
              </Link>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  store.clearNotifications().catch(() => {});
                }}
              >
                {t('bell.clear')}
              </button>
            </div>
          ) : undefined
        }
      >
        {list.length === 0 ? (
          <EmptyState emoji="🔕" title={t('bell.empty.title')} body={t('bell.empty.body')} />
        ) : (
          <ul className="-mx-2 space-y-1">
            {list.map((n) => (
              <li key={n.id} className={cx('rounded-xl', !n.readAt && 'bg-brand-50/60')}>
                <button
                  type="button"
                  disabled={!n.memoryId && !n.lendingId}
                  onClick={() => {
                    close();
                    if (n.memoryId) openMemory(n.memoryId);
                    else if (n.lendingId) location.assign('/app/people');
                  }}
                  className="flex w-full gap-3 rounded-xl p-3 pb-1 text-left transition hover:bg-paper disabled:hover:bg-transparent"
                >
                  <span className={cx('mt-1.5 size-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-brand-500')} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-ink">{n.title}</span>
                    <span className="block text-sm text-ink-soft">{n.body}</span>
                    <span className="mt-0.5 block text-xs text-muted">{timeAgo(n.createdAt, t)}</span>
                  </span>
                </button>
                <span className="block px-3 pb-2 pl-8">
                  <QuickActions n={n} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}
