import { CheckCircle2 } from 'lucide-react';
import { useT } from '../i18n';
import { getCategory } from '../lib/categories';
import { describeRepeat, formatDate, formatTimes, relativeLabel } from '../lib/dates';
import { formatMoney } from '../lib/format';
import type { ParsedQuickAdd } from '../lib/parser';
import { Modal } from './Modal';

export interface AddedItem {
  kind: 'memory' | 'lending';
  id: string;
  /** The name it was saved under (long notes get a shorter one). */
  title: string;
  parsed: ParsedQuickAdd;
}

function reminderLine(p: ParsedQuickAdd, onTheDay: string, atTimes: string, before: (n: number) => string): string | null {
  if (!p.dueDate || p.reminderDaysBefore == null) return null;
  // Timed items alert at each time on the day, as the Time row shows.
  if (p.reminderDaysBefore === 0) return p.times?.length ? atTimes : onTheDay;
  return before(p.reminderDaysBefore);
}

/** The pop-up after Quick Add saves something: what was understood, so mistakes are easy to spot. */
export function AddedSheet({ item, onDone, onEdit, onUndo }: { item: AddedItem | null; onDone: () => void; onEdit: () => void; onUndo: () => void }) {
  const t = useT();
  const p = item?.parsed;
  const rows: [string, string][] = [];
  if (p?.kind === 'lending') {
    if (p.person) rows.push([t('added.person'), p.person]);
    if (p.amount != null) rows.push([t('added.amount'), formatMoney(p.amount)]);
    if (p.thing) rows.push([t('added.thing'), p.thing]);
    if (p.dueDate) rows.push([t('added.date'), formatDate(p.dueDate, { year: 'always' })]);
    if (p.followUpDate) rows.push([t('added.followUp'), formatDate(p.followUpDate, { year: 'always' })]);
  } else if (p) {
    const cat = getCategory(p.categoryId === 'shopping' || p.categoryId === 'people' ? 'personal' : p.categoryId);
    rows.push([t('added.category'), `${cat.emoji} ${p.subcategory ? `${cat.name} · ${p.subcategory}` : cat.name}`]);
    rows.push([t('added.date'), p.dueDate ? `${formatDate(p.dueDate, { year: 'always' })} (${relativeLabel(p.dueDate)})` : t('added.noDate')]);
    if (p.times?.length) rows.push([p.times.length > 1 ? t('added.times') : t('added.time'), formatTimes(p.times)]);
    rows.push([t('added.repeats'), p.repeat.frequency === 'never' ? t('added.once') : describeRepeat(p.repeat)]);
    const r = reminderLine(p, t('added.onTheDay'), t('added.atTimes'), (n) => t(n === 1 ? 'added.dayBefore' : 'added.daysBefore', { n }));
    rows.push([t('added.reminder'), r ?? t('added.noReminder')]);
    if (p.amount != null) rows.push([t('added.amount'), formatMoney(p.amount)]);
  }

  return (
    <Modal
      open={!!item}
      onClose={onDone}
      title={
        <span className="flex items-center gap-2">
          <CheckCircle2 className="size-6 text-ok" aria-hidden="true" />
          {t('added.title')}
        </span>
      }
      footer={
        <div className="flex items-center gap-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onUndo}>
            {t('act.undo')}
          </button>
          <div className="ml-auto flex gap-2">
            {item?.kind === 'memory' && (
              <button type="button" className="btn btn-secondary" onClick={onEdit}>
                {t('added.edit')}
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={onDone} data-autofocus>
              {t('added.done')}
            </button>
          </div>
        </div>
      }
    >
      {item && (
        <>
          <p className="text-xl font-bold leading-snug text-ink">{item.title}</p>
          <dl className="mt-3 divide-y divide-line rounded-2xl bg-paper px-4">
            {rows.map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-4 py-2.5">
                <dt className="shrink-0 text-sm text-muted">{label}</dt>
                <dd className="text-right font-semibold text-ink">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-sm text-muted">{t('added.hint')}</p>
        </>
      )}
    </Modal>
  );
}
