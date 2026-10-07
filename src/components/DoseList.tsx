import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { formatTime, todayISO } from '../lib/dates';
import { dosesOn, readTaken, writeTaken } from '../lib/medicines';
import { useStore, useViews } from '../store/DataProvider';
import { cx } from './ui';

function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Today's medicine doses with a "Taken" tick for each. */
export function DoseList({ limit }: { limit?: number }) {
  const store = useStore();
  const { data } = useViews();
  const day = todayISO();
  const doses = useMemo(() => dosesOn(data.memories, data.recurrences, day), [data.memories, data.recurrences, day]);
  const [taken, setTaken] = useState(() => readTaken(store.uid, day));
  const now = nowHHMM();
  const shown = limit ? doses.slice(0, limit) : doses;

  const toggle = (k: string) => {
    const next = new Set(taken);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setTaken(next);
    writeTaken(store.uid, day, next);
  };

  if (!doses.length) return null;
  return (
    <ul className="space-y-1.5" aria-label="Today’s doses">
      {shown.map((d) => {
        const done = taken.has(d.key);
        const late = !done && d.time < now;
        return (
          <li key={d.key} className="flex items-center gap-3 rounded-xl px-2 py-1.5">
            <span className={cx('w-[4.5rem] shrink-0 text-sm font-semibold tabular-nums', late ? 'text-attn' : 'text-muted')}>{formatTime(d.time)}</span>
            <span className={cx('min-w-0 flex-1 truncate font-semibold', done && 'text-muted line-through')}>{d.title}</span>
            <button
              type="button"
              aria-pressed={done}
              aria-label={`${done ? 'Taken' : 'Mark taken'}: ${d.title} at ${formatTime(d.time)}`}
              onClick={() => toggle(d.key)}
              className={cx(
                'flex min-h-9 items-center gap-1 rounded-full px-3 text-xs font-bold transition',
                done ? 'bg-ok-bg text-ok' : late ? 'bg-attn-bg text-attn' : 'bg-brand-50 text-brand-700',
              )}
            >
              {done && <Check className="size-3.5" aria-hidden="true" />}
              {done ? 'Taken' : late ? 'Missed?' : 'Take'}
            </button>
          </li>
        );
      })}
      {limit && doses.length > limit && <li className="px-2 text-sm text-muted">+{doses.length - limit} more today</li>}
    </ul>
  );
}
