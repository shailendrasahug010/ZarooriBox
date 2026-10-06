import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Repeat } from 'lucide-react';
import { useUI } from '../components/UIProvider';
import { CategoryTile, EmptyState, PageHeader, StatusDot, cx } from '../components/ui';
import { eventsBetween, type CalendarEvent } from '../lib/calendar';
import { formatDate, fromISO, monthName, toISO, todayISO } from '../lib/dates';
import { useViews } from '../store/DataProvider';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function Calendar() {
  const { memories, lendings } = useViews();
  const { openMemory, openLendingForm } = useUI();
  const today = todayISO();
  const [cursor, setCursor] = useState(() => {
    const d = fromISO(today);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selected, setSelected] = useState(today);

  const { days, events } = useMemo(() => {
    const first = new Date(cursor);
    const offset = (first.getDay() + 6) % 7; // Monday first
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset);
    const cells = Array.from({ length: 42 }, (_, i) => toISO(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)));
    return { days: cells, events: eventsBetween(memories, lendings, cells[0], cells[41]) };
  }, [cursor, memories, lendings]);

  const month = cursor.getMonth();
  const selectedEvents = events.get(selected) ?? [];
  const move = (n: number) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + n, 1));

  const openEvent = (e: CalendarEvent) => {
    if (e.memory) openMemory(e.memory.id);
    else if (e.lending) openLendingForm({ lending: e.lending });
  };

  const onKeyDown = (e: React.KeyboardEvent, iso: string) => {
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!delta) return;
    e.preventDefault();
    const d = fromISO(iso);
    d.setDate(d.getDate() + delta);
    const next = toISO(d);
    setSelected(next);
    if (d.getMonth() !== month) setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-date="${next}"]`)?.focus());
  };

  return (
    <div>
      <PageHeader title="Calendar" subtitle="Bills, renewals, maintenance and dates that matter." />
      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <section className="card p-3 sm:p-5" aria-label="Month">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold" aria-live="polite">
              {monthName(month)} {cursor.getFullYear()}
            </h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  const d = fromISO(today);
                  setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
                  setSelected(today);
                }}
              >
                Today
              </button>
              <button type="button" className="icon-btn" aria-label="Previous month" onClick={() => move(-1)}>
                <ChevronLeft className="size-5" />
              </button>
              <button type="button" className="icon-btn" aria-label="Next month" onClick={() => move(1)}>
                <ChevronRight className="size-5" />
              </button>
            </div>
          </div>
          <div role="grid" aria-label={`${monthName(month)} ${cursor.getFullYear()}`}>
            <div role="row" className="grid grid-cols-7 text-center text-xs font-semibold text-muted">
              {DOW.map((d) => (
                <div role="columnheader" key={d} className="py-1.5">
                  {d}
                </div>
              ))}
            </div>
            {Array.from({ length: 6 }, (_, w) => (
              <div role="row" key={w} className="grid grid-cols-7 gap-1">
                {days.slice(w * 7, w * 7 + 7).map((iso) => {
                  const d = fromISO(iso);
                  const ev = events.get(iso) ?? [];
                  const inMonth = d.getMonth() === month;
                  const isSel = iso === selected;
                  const isToday = iso === today;
                  return (
                    <div role="gridcell" key={iso} aria-selected={isSel}>
                      <button
                        type="button"
                        data-date={iso}
                        tabIndex={isSel ? 0 : -1}
                        onClick={() => setSelected(iso)}
                        onKeyDown={(e) => onKeyDown(e, iso)}
                        aria-label={`${formatDate(iso, { year: 'always' })}${ev.length ? `, ${ev.length} item${ev.length > 1 ? 's' : ''}` : ''}`}
                        className={cx(
                          'flex aspect-square w-full flex-col items-center justify-start gap-1 rounded-xl pt-1.5 text-sm transition sm:aspect-[1.15] sm:pt-2',
                          isSel ? 'bg-ink text-white' : isToday ? 'bg-brand-50 font-bold text-brand-800' : 'hover:bg-paper',
                          !inMonth && !isSel && 'text-muted/50',
                        )}
                      >
                        <span className="font-semibold">{d.getDate()}</span>
                        {ev.length > 0 && (
                          <span className="flex gap-0.5" aria-hidden="true">
                            {ev.slice(0, 3).map((e) => (
                              <span
                                key={e.key}
                                className={cx(
                                  'size-1.5 rounded-full',
                                  isSel ? 'bg-white' : e.kind === 'lending' ? 'bg-rose-400' : e.memory?.urgency === 'attention' ? 'bg-attn-dot' : e.projected ? 'bg-line-strong' : 'bg-brand-500',
                                )}
                              />
                            ))}
                          </span>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </section>

        <section className="card p-4 sm:p-5" aria-label="Selected day" aria-live="polite">
          <h2 className="section-title mb-2">
            {selected === today ? 'Today' : formatDate(selected, { year: 'always' })}
            <span className="text-sm font-medium text-muted">{fromISO(selected).toLocaleDateString('en-IN', { weekday: 'long' })}</span>
          </h2>
          {selectedEvents.length === 0 ? (
            <EmptyState emoji="🗓️" title="Nothing on this day" body="Pick another date or add something new." />
          ) : (
            <ul className="-mx-2 space-y-0.5">
              {selectedEvents.map((e) => (
                <li key={e.key}>
                  <button type="button" onClick={() => openEvent(e)} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 text-left hover:bg-paper">
                    {e.memory ? <CategoryTile categoryId={e.memory.categoryId} size="sm" /> : <CategoryTile categoryId="people" size="sm" />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{e.title}</span>
                      <span className="flex items-center gap-1 text-xs text-muted">
                        {e.projected && <Repeat className="size-3" aria-hidden="true" />}
                        {e.projected ? 'Repeats' : e.memory?.subcategory ?? (e.kind === 'lending' ? 'Follow-up' : '')}
                      </span>
                    </span>
                    {e.memory && !e.projected && <StatusDot urgency={e.memory.urgency} />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
