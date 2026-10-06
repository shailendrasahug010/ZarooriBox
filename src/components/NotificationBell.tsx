import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, BellRing } from 'lucide-react';
import { useData, useStore } from '../store/DataProvider';
import { Modal } from './Modal';
import { useUI } from './UIProvider';
import { EmptyState, cx } from './ui';

function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export function NotificationBell() {
  const data = useData();
  const store = useStore();
  const { openMemory } = useUI();
  const [open, setOpen] = useState(false);
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
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
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
        title="Notifications"
        footer={
          list.length > 0 ? (
            <div className="flex items-center justify-between">
              <Link to="/app/settings#notifications" onClick={close} className="text-sm font-semibold text-brand-700">
                Notification settings
              </Link>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  store.clearNotifications().catch(() => {});
                }}
              >
                Clear all
              </button>
            </div>
          ) : undefined
        }
      >
        {list.length === 0 ? (
          <EmptyState emoji="🔕" title="You’re all caught up" body="Reminders will show up here when something needs you." />
        ) : (
          <ul className="-mx-2 space-y-1">
            {list.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  disabled={!n.memoryId && !n.lendingId}
                  onClick={() => {
                    close();
                    if (n.memoryId) openMemory(n.memoryId);
                    else if (n.lendingId) location.assign('/app/people');
                  }}
                  className={cx('flex w-full gap-3 rounded-xl p-3 text-left transition hover:bg-paper disabled:hover:bg-transparent', !n.readAt && 'bg-brand-50/60')}
                >
                  <span className={cx('mt-1.5 size-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-brand-500')} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-ink">{n.title}</span>
                    <span className="block text-sm text-ink-soft">{n.body}</span>
                    <span className="mt-0.5 block text-xs text-muted">{timeAgo(n.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}
