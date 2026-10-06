import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlarmClock, Archive, ArchiveRestore, Bell, CalendarDays, Check, MapPin, Paperclip, Pencil, Repeat, RotateCcw, Trash2, User, Users, Wallet } from 'lucide-react';
import { useStore, useViews } from '../store/DataProvider';
import { useT } from '../i18n';
import { useToast } from './Toast';
import { getCategory } from '../lib/categories';
import { describeRepeat, formatDate } from '../lib/dates';
import { formatMoney } from '../lib/format';
import { ConfirmDialog, Modal } from './Modal';
import { useMemoryActions } from './useMemoryActions';
import { CategoryTile, DuePill, Switch } from './ui';

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <span className="mt-0.5 text-muted" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
        <dd className="mt-0.5 break-words text-ink">{children}</dd>
      </div>
    </div>
  );
}

export function MemoryDetail({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { memories } = useViews();
  const navigate = useNavigate();
  const { complete, snooze, setStatus, remove } = useMemoryActions();
  const store = useStore();
  const toast = useToast();
  const t = useT();
  const [confirm, setConfirm] = useState(false);
  const m = id ? memories.find((x) => x.id === id) : undefined;
  if (!m) return null;
  const cat = getCategory(m.categoryId);
  const reminder = m.reminder;

  const close = (fn?: () => void) => {
    onClose();
    fn?.();
  };

  return (
    <>
      <Modal
        open={!!m && !confirm}
        onClose={onClose}
        title={
          <span className="flex items-center gap-3">
            <CategoryTile categoryId={m.categoryId} />
            <span className="min-w-0">
              <span className="block text-xs font-semibold uppercase tracking-wide text-muted">
                {cat.name}
                {m.subcategory ? ` · ${m.subcategory}` : ''}
              </span>
              <span className="block break-words">{m.title}</span>
            </span>
          </span>
        }
        footer={
          <div className="flex flex-wrap items-center gap-2">
            {m.status === 'active' ? (
              <button type="button" className="btn btn-primary flex-1 sm:flex-none" onClick={() => close(() => complete(m.id))} data-autofocus>
                <Check className="size-4" /> {m.recurrence ? 'Done for now' : 'Mark done'}
              </button>
            ) : (
              <button type="button" className="btn btn-primary flex-1 sm:flex-none" onClick={() => close(() => setStatus(m.id, 'active'))}>
                <RotateCcw className="size-4" /> Make active
              </button>
            )}
            {m.status === 'active' && m.dueDate && (
              <button type="button" className="btn btn-secondary" onClick={() => close(() => snooze(m.id, 1))}>
                <AlarmClock className="size-4" /> {t('act.tomorrow')}
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={() => close(() => navigate(`/app/edit/${m.id}`))}>
              <Pencil className="size-4" /> Edit
            </button>
            <div className="ml-auto flex gap-1">
              {m.status !== 'archived' ? (
                <button type="button" className="icon-btn" aria-label="Archive" title="Archive" onClick={() => close(() => setStatus(m.id, 'archived'))}>
                  <Archive className="size-5" />
                </button>
              ) : (
                <button type="button" className="icon-btn" aria-label="Unarchive" title="Unarchive" onClick={() => close(() => setStatus(m.id, 'active'))}>
                  <ArchiveRestore className="size-5" />
                </button>
              )}
              <button type="button" className="icon-btn text-attn hover:bg-attn-bg" aria-label="Delete" title="Delete" onClick={() => setConfirm(true)}>
                <Trash2 className="size-5" />
              </button>
            </div>
          </div>
        }
      >
        <div className="mb-3 flex flex-wrap gap-2">
          {m.status === 'active' && m.dueDate && <DuePill date={m.dueDate} urgency={m.urgency} />}
          {m.status !== 'active' && (
            <span className="rounded-full bg-ink/5 px-2.5 py-1 text-xs font-semibold capitalize text-muted">{m.status}</span>
          )}
          {m.lastCompletedAt && <span className="rounded-full bg-ok-bg px-2.5 py-1 text-xs font-semibold text-ok">Last done {formatDate(m.lastCompletedAt.slice(0, 10))}</span>}
        </div>
        {m.description && <p className="mb-2 text-ink-soft">{m.description}</p>}
        {store.family && (m.userId === store.user.id ? (
          <div className="mb-2 flex items-center justify-between gap-3 rounded-xl bg-paper px-3 py-2.5">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Users className="size-4 text-brand-600" aria-hidden="true" /> {t('fam.shareThis')}
            </span>
            <Switch
              checked={!!m.householdId}
              label={t('fam.shareThis')}
              onChange={(v) =>
                store
                  .setShared(m.id, v)
                  .then(() => toast.success(v ? t('fam.nowShared') : t('fam.nowPrivate')))
                  .catch((e: Error) => toast.error(e.message))
              }
            />
          </div>
        ) : (
          <p className="mb-2 flex items-center gap-2 rounded-xl bg-paper px-3 py-2.5 text-sm font-semibold">
            <Users className="size-4 text-brand-600" aria-hidden="true" /> {t('fam.addedBy', { name: store.addedBy(m.userId) ?? '' })}
          </p>
        ))}
        <dl className="divide-y divide-line">
          {m.dueDate && (
            <Row icon={<CalendarDays className="size-5" />} label={m.isExpiry ? 'Expires / due' : 'Due'}>
              {formatDate(m.dueDate, { year: 'always' })}
            </Row>
          )}
          <Row icon={<Bell className="size-5" />} label="Reminder">
            {reminder
              ? `${reminder.offsetDays === 0 ? 'On the day' : reminder.offsetDays != null ? `${reminder.offsetDays} day${reminder.offsetDays === 1 ? '' : 's'} before` : 'On'} · ${formatDate(reminder.remindOn, { year: 'always' })}`
              : 'No reminder'}
          </Row>
          {m.recurrence && (
            <Row icon={<Repeat className="size-5" />} label="Repeats">
              {describeRepeat(m.recurrence)}
            </Row>
          )}
          {m.amount != null && m.amount > 0 && (
            <Row icon={<Wallet className="size-5" />} label="Amount">
              {formatMoney(m.amount, m.currency)}
            </Row>
          )}
          {m.person && (
            <Row icon={<User className="size-5" />} label="Person">
              {m.person.name}
            </Row>
          )}
          {m.location && (
            <Row icon={<MapPin className="size-5" />} label="Location">
              {m.location}
            </Row>
          )}
          {m.attachments.length > 0 && (
            <Row icon={<Paperclip className="size-5" />} label="Attachments">
              <ul className="space-y-1">
                {m.attachments.map((a) => (
                  <li key={a.id}>
                    {a.dataUrl ? (
                      <a href={a.dataUrl} download={a.name} className="font-medium text-brand-700 underline-offset-2 hover:underline">
                        {a.name}
                      </a>
                    ) : (
                      a.name
                    )}{' '}
                    <span className="text-sm text-muted">({Math.ceil(a.size / 1024)} KB)</span>
                  </li>
                ))}
              </ul>
            </Row>
          )}
        </dl>
        {m.notes && (
          <div className="mt-3 rounded-xl bg-soon-bg/60 p-3.5 text-sm text-ink-soft">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-soon">Notes</p>
            <p className="whitespace-pre-wrap">{m.notes}</p>
          </div>
        )}
      </Modal>
      <ConfirmDialog
        open={confirm}
        title="Delete this memory?"
        body={<>“{m.title}” and its reminders will be removed. You can undo right after.</>}
        confirmLabel="Delete"
        danger
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          close(() => remove(m.id));
        }}
      />
    </>
  );
}
