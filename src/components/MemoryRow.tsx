import { useRef, useState, type PointerEvent } from 'react';
import { AlarmClock, Check, Repeat, Star, Users } from 'lucide-react';
import { useT } from '../i18n';
import { useStore } from '../store/DataProvider';
import { getCategory } from '../lib/categories';
import { formatDate, formatTimes } from '../lib/dates';
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
  if (m.dueDate) parts.push(m.dueTimes?.length ? `${formatDate(m.dueDate)}, ${formatTimes(m.dueTimes)}` : formatDate(m.dueDate));
  if (m.amount) parts.push(formatMoney(m.amount, m.currency));
  return parts.join(' · ');
}

const SWIPE_AT = 88;

/**
 * Swipe right to finish, left to be reminded tomorrow (touch and mouse). The buttons
 * stay for everyone else; swiping is a shortcut, never the only way.
 */
function useSwipe(enabled: boolean, onRight: () => void, onLeft: () => void) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const horizontal = useRef(false);
  const moved = useRef(false);

  const reset = () => {
    start.current = null;
    horizontal.current = false;
    setDx(0);
  };

  const handlers = enabled
    ? {
        onPointerDown: (e: PointerEvent) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
          moved.current = false;
        },
        onPointerMove: (e: PointerEvent) => {
          const s = start.current;
          if (!s || s.id !== e.pointerId) return;
          const x = e.clientX - s.x;
          const y = e.clientY - s.y;
          if (!horizontal.current) {
            if (Math.abs(y) > 10 && Math.abs(y) > Math.abs(x)) return reset();
            if (Math.abs(x) < 10) return;
            horizontal.current = true;
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          }
          moved.current = true;
          setDx(Math.max(-140, Math.min(140, x)));
        },
        onPointerUp: () => {
          const x = dx;
          reset();
          if (x >= SWIPE_AT) onRight();
          else if (x <= -SWIPE_AT) onLeft();
        },
        onPointerCancel: reset,
        // A drag isn't a tap.
        onClickCapture: (e: React.MouseEvent) => {
          if (moved.current) {
            e.preventDefault();
            e.stopPropagation();
            moved.current = false;
          }
        },
      }
    : {};
  return { dx, handlers };
}

export function MemoryRow({ m, showCheck = true, compact = false, showSnooze = false }: { m: MemoryView; showCheck?: boolean; compact?: boolean; showSnooze?: boolean }) {
  const { openMemory } = useUI();
  const { complete, snooze } = useMemoryActions();
  const store = useStore();
  const t = useT();
  const [leaving, setLeaving] = useState(false);
  const recurring = !!m.recurrence;
  const canSwipe = showCheck && m.status === 'active';
  const done = () => {
    if (!recurring) setLeaving(true);
    complete(m.id);
  };
  const { dx, handlers } = useSwipe(canSwipe, done, () => snooze(m.id, 1));
  const addedBy = store.addedBy(m.userId);
  return (
    <li className={cx('relative overflow-hidden rounded-xl', leaving && 'animate-leave')}>
      {dx !== 0 && (
        <div
          className={cx('absolute inset-0 flex items-center rounded-xl px-4 text-sm font-bold text-white', dx > 0 ? 'justify-start bg-brand-600' : 'justify-end bg-soon')}
          aria-hidden="true"
        >
          {dx > 0 ? (
            <span className="inline-flex items-center gap-1.5">
              <Check className="size-4" strokeWidth={3} /> {t('act.done')}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <AlarmClock className="size-4" /> {t('act.tomorrow')}
            </span>
          )}
        </div>
      )}
      <div
        {...handlers}
        style={dx ? { transform: `translateX(${dx}px)` } : undefined}
        className={cx('relative flex items-center gap-1 rounded-xl bg-surface transition-colors hover:bg-paper/80', canSwipe && 'touch-pan-y', !dx && 'transition-transform')}
      >
      {showCheck && m.status === 'active' ? (
        <CompleteButton label={t('act.markDone', { title: m.title })} onComplete={done} />
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
          <span className={cx('flex items-center gap-1 font-semibold', m.status === 'completed' && 'text-muted line-through decoration-ink/30')}>
            {m.favorite && <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-500" aria-label={t('fav.title')} />}
            <span className="truncate">{m.title}</span>
          </span>
          <span className="flex items-center gap-1.5 truncate text-[0.83rem] text-muted">
            {recurring && <Repeat className="size-3.5 shrink-0" aria-label="Repeats" />}
            {m.householdId && <Users className="size-3.5 shrink-0 text-brand-600" aria-label={t('fam.shared')} />}
            <span className="truncate">
              {memoryMeta(m)}
              {addedBy ? ` · ${t('fam.addedBy', { name: addedBy })}` : ''}
            </span>
          </span>
        </span>
        {m.dueDate && m.status === 'active' && <DuePill date={m.dueDate} urgency={m.urgency} />}
      </button>
      {showSnooze && m.status === 'active' && (
        <button
          type="button"
          onClick={() => snooze(m.id, 1)}
          aria-label={t('act.snoozeLabel', { title: m.title })}
          title={t('act.snoozeLabel', { title: m.title })}
          className="grid size-11 shrink-0 place-items-center rounded-full text-soon transition hover:bg-soon-bg"
        >
          <AlarmClock className="size-5" aria-hidden="true" />
        </button>
      )}
      </div>
    </li>
  );
}
