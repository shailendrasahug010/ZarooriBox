import { useState } from 'react';
import { Check, Repeat } from 'lucide-react';
import { getCategory } from '../lib/categories';
import { formatDate } from '../lib/dates';
import { formatMoney } from '../lib/format';
import type { MemoryView } from '../lib/selectors';
import { useUI } from './UIProvider';
import { useMemoryActions } from './useMemoryActions';
import { CategoryTile, DuePill, cx } from './ui';

export function CompleteButton({ done, onComplete, label }: { done?: boolean; onComplete: () => void; label: string }) {
  const [checking, setChecking] = useState(false);
  const checked = done || checking;
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={!!done}
      onClick={(e) => {
        e.stopPropagation();
        if (checking) return;
        setChecking(true);
        window.setTimeout(() => {
          onComplete();
          setChecking(false);
        }, 380);
      }}
      className="group/check grid size-11 shrink-0 place-items-center rounded-full"
    >
      <span
        className={cx(
          'grid size-6 place-items-center rounded-full border-2 transition-all duration-200',
          checked ? 'scale-110 border-brand-600 bg-brand-600' : 'border-line-strong group-hover/check:border-brand-500 group-hover/check:bg-brand-50',
        )}
      >
        <svg viewBox="0 0 24 24" className={cx('size-4 text-white', checked ? 'opacity-100' : 'opacity-0')} aria-hidden="true">
          <path
            d="M5 12.5l4.5 4.5L19 7.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="24"
            className={checked ? 'animate-check' : ''}
          />
        </svg>
      </span>
    </button>
  );
}

export function memoryMeta(m: MemoryView): string {
  const parts = [m.subcategory || getCategory(m.categoryId).name];
  if (m.dueDate) parts.push(formatDate(m.dueDate));
  if (m.amount) parts.push(formatMoney(m.amount, m.currency));
  return parts.join(' · ');
}

export function MemoryRow({ m, showCheck = true, compact = false }: { m: MemoryView; showCheck?: boolean; compact?: boolean }) {
  const { openMemory } = useUI();
  const { complete } = useMemoryActions();
  const [leaving, setLeaving] = useState(false);
  const recurring = !!m.recurrence;
  return (
    <li className={cx('flex items-center gap-1 rounded-xl transition-colors hover:bg-paper/80', leaving && 'animate-leave')}>
      {showCheck && m.status === 'active' ? (
        <CompleteButton
          label={`Mark “${m.title}” as done`}
          onComplete={() => {
            if (!recurring) setLeaving(true);
            complete(m.id);
          }}
        />
      ) : m.status === 'completed' ? (
        <span className="grid size-11 shrink-0 place-items-center" aria-label="Completed">
          <span className="grid size-6 place-items-center rounded-full bg-brand-600">
            <Check className="size-4 text-white" strokeWidth={3} />
          </span>
        </span>
      ) : null}
      <button
        type="button"
        onClick={() => openMemory(m.id)}
        className={cx('flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-xl py-2 pr-2 text-left', !showCheck && 'pl-2')}
      >
        {!compact && <CategoryTile categoryId={m.categoryId} size="sm" />}
        <span className="min-w-0 flex-1">
          <span className={cx('block truncate font-semibold', m.status === 'completed' && 'text-muted line-through decoration-ink/30')}>{m.title}</span>
          <span className="flex items-center gap-1.5 truncate text-[0.83rem] text-muted">
            {recurring && <Repeat className="size-3.5 shrink-0" aria-label="Repeats" />}
            <span className="truncate">{memoryMeta(m)}</span>
          </span>
        </span>
        {m.dueDate && m.status === 'active' && <DuePill date={m.dueDate} urgency={m.urgency} />}
      </button>
    </li>
  );
}
