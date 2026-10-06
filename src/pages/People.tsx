import { useState } from 'react';
import { Check, MessageCircle, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '../components/Modal';
import { useToast } from '../components/Toast';
import { useUI } from '../components/UIProvider';
import { EmptyState, PageHeader, Segmented, StatusDot, cx } from '../components/ui';
import { formatDate, relativeLabel } from '../lib/dates';
import { formatMoney } from '../lib/format';
import type { LendingView } from '../lib/selectors';
import { useStore, useViews } from '../store/DataProvider';
import { lendingTitle } from './Dashboard';

type Tab = 'lent' | 'borrowed' | 'returned';

function LendingCard({ l }: { l: LendingView }) {
  const store = useStore();
  const toast = useToast();
  const { openLendingForm } = useUI();
  const [confirm, setConfirm] = useState(false);
  const returned = l.status === 'returned';

  const remind = async () => {
    const text = store.reminderMessage(l);
    try {
      if (navigator.share) {
        await navigator.share({ text });
      } else {
        const phone = l.person?.phone?.replace(/\D/g, '') ?? '';
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
      }
      await store.markLendingReminded(l.id);
      toast.success(`Reminder ready for ${l.person?.name ?? 'them'}`);
    } catch {
      // Share sheet dismissed; nothing to do.
    }
  };

  return (
    <li className="card animate-fade-up p-4">
      <div className="flex items-start gap-3">
        <span
          className={cx('grid size-11 shrink-0 place-items-center rounded-full text-base font-bold', l.direction === 'lent' ? 'bg-brand-50 text-brand-700' : 'bg-soon-bg text-soon')}
          aria-hidden="true"
        >
          {(l.person?.name ?? '?').slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <p className={cx('font-semibold', returned && 'text-muted line-through decoration-ink/30')}>{lendingTitle(l)}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted">
            <span>{formatDate(l.date, { year: 'auto' })}</span>
            {!returned && l.followUpDate && (
              <span className="inline-flex items-center gap-1.5">
                · <StatusDot urgency={l.urgency} /> Follow up {formatDate(l.followUpDate)} ({relativeLabel(l.followUpDate).toLowerCase()})
              </span>
            )}
            {returned && l.returnedAt && <span>· Returned {formatDate(l.returnedAt.slice(0, 10))}</span>}
          </p>
          {l.notes && <p className="mt-2 rounded-lg bg-paper px-3 py-2 text-sm text-ink-soft">{l.notes}</p>}
        </div>
        {l.kind === 'money' && <span className="shrink-0 text-lg font-extrabold tracking-tight">{formatMoney(l.amount, l.currency)}</span>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
        {returned ? (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => store.setLendingReturned(l.id, false)}>
            <RotateCcw className="size-4" aria-hidden="true" /> Not returned
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={async () => {
                await store.setLendingReturned(l.id, true);
                toast.success(l.direction === 'lent' ? 'Marked as returned 🎉' : 'Marked as given back 🎉', {
                  label: 'Undo',
                  onClick: () => void store.setLendingReturned(l.id, false),
                });
              }}
            >
              <Check className="size-4" aria-hidden="true" /> {l.kind === 'money' ? (l.direction === 'lent' ? 'Got it back' : 'Paid back') : 'Returned'}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={remind}>
              <MessageCircle className="size-4" aria-hidden="true" /> {l.direction === 'lent' ? 'Send reminder' : 'Message'}
            </button>
          </>
        )}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => openLendingForm({ lending: l })} aria-label={`Edit ${lendingTitle(l)}`}>
          <Pencil className="size-4" aria-hidden="true" /> Edit / notes
        </button>
        <button type="button" className="btn btn-ghost btn-sm ml-auto text-attn hover:bg-attn-bg" onClick={() => setConfirm(true)} aria-label={`Delete ${lendingTitle(l)}`}>
          <Trash2 className="size-4" aria-hidden="true" />
        </button>
      </div>
      <ConfirmDialog
        open={confirm}
        title="Delete this record?"
        body={lendingTitle(l)}
        confirmLabel="Delete"
        danger
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          setConfirm(false);
          const removed = await store.deleteLending(l.id);
          if (removed) toast.success('Deleted', { label: 'Undo', onClick: () => void store.restoreLending(removed) });
        }}
      />
    </li>
  );
}

export default function People() {
  const { lendings } = useViews();
  const { openLendingForm } = useUI();
  const [tab, setTab] = useState<Tab>('lent');
  const open = lendings.filter((l) => l.status === 'open');
  const owedToMe = open.filter((l) => l.direction === 'lent' && l.kind === 'money').reduce((s, l) => s + (l.amount ?? 0), 0);
  const iOwe = open.filter((l) => l.direction === 'borrowed' && l.kind === 'money').reduce((s, l) => s + (l.amount ?? 0), 0);
  const thingsOut = open.filter((l) => l.kind === 'thing').length;

  const list = lendings
    .filter((l) => (tab === 'returned' ? l.status === 'returned' : l.status === 'open' && l.direction === tab))
    .sort((a, b) => (a.followUpDate ?? a.date).localeCompare(b.followUpDate ?? b.date));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="People & Things"
        subtitle="Money and things you lent or borrowed, so nobody has to remember."
        action={
          <button type="button" className="btn btn-primary btn-sm" onClick={() => openLendingForm({ preset: { direction: tab === 'borrowed' ? 'borrowed' : 'lent' } })}>
            <Plus className="size-4" aria-hidden="true" /> Add
          </button>
        }
      />
      <div className="mb-5 grid grid-cols-3 gap-2.5 sm:gap-3">
        {[
          { label: 'Others owe you', value: formatMoney(owedToMe), tone: 'text-brand-700' },
          { label: 'You owe', value: formatMoney(iOwe), tone: 'text-soon' },
          { label: 'Things out', value: String(thingsOut), tone: 'text-ink' },
        ].map((s) => (
          <div key={s.label} className="card p-3 sm:p-4">
            <p className="text-xs font-semibold text-muted sm:text-sm">{s.label}</p>
            <p className={cx('mt-1 text-lg font-extrabold tracking-tight sm:text-2xl', s.tone)}>{s.value}</p>
          </div>
        ))}
      </div>
      <div className="mb-4">
        <Segmented
          label="Show"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'lent', label: 'I lent', count: open.filter((l) => l.direction === 'lent').length },
            { value: 'borrowed', label: 'I borrowed', count: open.filter((l) => l.direction === 'borrowed').length },
            { value: 'returned', label: 'Returned', count: lendings.filter((l) => l.status === 'returned').length },
          ]}
        />
      </div>
      {list.length === 0 ? (
        <div className="card">
          <EmptyState
            emoji="🤝"
            title={tab === 'returned' ? 'Nothing returned yet' : 'Nothing lent or borrowed yet.'}
            body={tab === 'returned' ? undefined : 'Tip: type “I lent Rahul ₹500 today” in Quick Add.'}
            action={
              tab !== 'returned' && (
                <button type="button" className="btn btn-secondary" onClick={() => openLendingForm({ preset: { direction: tab } })}>
                  Add one
                </button>
              )
            }
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map((l) => (
            <LendingCard key={l.id} l={l} />
          ))}
        </ul>
      )}
    </div>
  );
}
