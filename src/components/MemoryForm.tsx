import { useState, type FormEvent } from 'react';
import { ChevronDown, Clock, Paperclip, Plus, X } from 'lucide-react';
import type { Attachment, CategoryId, RepeatFrequency, RepeatUnit } from '../types';
import { MEMORY_CATEGORIES, getCategory } from '../lib/categories';
import { REPEAT_LABELS, REPEAT_PRESETS, addDays, formatDate, todayISO } from '../lib/dates';
import { useData } from '../store/DataProvider';
import type { FieldErrors, MemoryInput, ReminderChoice } from '../store/memoryInput';
import { Field, Segmented, Switch, cx } from './ui';
import { useT } from '../i18n';

const REMINDER_OPTIONS: { value: string; label: string }[] = [
  { value: 'none', label: 'No reminder' },
  { value: '0', label: 'On the day' },
  { value: '1', label: '1 day before' },
  { value: '2', label: '2 days before' },
  { value: '3', label: '3 days before' },
  { value: '7', label: '1 week before' },
  { value: '15', label: '2 weeks before' },
  { value: '30', label: '30 days before' },
  { value: '60', label: '2 months before' },
  { value: 'date', label: 'On a specific date…' },
];

function reminderKey(r: ReminderChoice) {
  if (r.mode === 'none') return 'none';
  if (r.mode === 'date') return 'date';
  return REMINDER_OPTIONS.some((o) => o.value === String(r.offsetDays)) ? String(r.offsetDays) : 'custom-offset';
}

export interface MemoryFormProps {
  initial: MemoryInput;
  existingAttachments?: Attachment[];
  submitLabel: string;
  onSubmit: (input: MemoryInput) => Promise<void>;
  onCancel: () => void;
  errors: FieldErrors;
  saving: boolean;
  /** Files to attach from the start (a scanned document). */
  initialFiles?: File[];
  /** Family name when the person may share this item; omit to hide the switch. */
  shareWith?: string;
}

export function MemoryForm({ initial, existingAttachments = [], submitLabel, onSubmit, onCancel, errors, saving, initialFiles = [], shareWith }: MemoryFormProps) {
  const data = useData();
  const t = useT();
  const [f, setF] = useState<MemoryInput>(initial);
  const [removed, setRemoved] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>(initialFiles);
  const hasExtras = !!(initial.amount || initial.personName || initial.location || initial.notes || existingAttachments.length || initialFiles.length);
  const [moreOpen, setMoreOpen] = useState(hasExtras);
  const set = <K extends keyof MemoryInput>(k: K, v: MemoryInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const cat = getCategory(f.categoryId);
  // Keep a custom subcategory visible if it isn't one of the presets.
  const subOptions = f.subcategory && !cat.subcategories.includes(f.subcategory) ? [...cat.subcategories, f.subcategory] : cat.subcategories;
  const rKey = reminderKey(f.reminder);

  const err = (k: string) => ({ 'aria-invalid': !!errors[k], 'aria-describedby': errors[k] ? `mf-${k}-error` : undefined });

  const setReminder = (v: string) => {
    if (v === 'none') set('reminder', { mode: 'none' });
    else if (v === 'date') set('reminder', { mode: 'date', date: f.dueDate ? addDays(f.dueDate, -1) : '' });
    else if (v !== 'custom-offset') set('reminder', { mode: 'offset', offsetDays: Number(v) });
  };

  const setRepeat = (freq: RepeatFrequency) => {
    if (freq === 'custom') set('repeat', { frequency: 'custom', interval: f.repeat.interval > 0 ? f.repeat.interval : 2, unit: f.repeat.unit ?? 'month' });
    else set('repeat', { ...REPEAT_PRESETS[freq] });
  };

  const times = f.times ?? [];
  const isMedicine = f.categoryId === 'health' && f.subcategory === 'Medicines';
  const setTimes = (next: string[]) => setF((x) => ({ ...x, times: next, dueDate: next.length && !x.dueDate ? todayISO() : x.dueDate }));
  const addTime = () => setTimes([...times, times.length === 0 ? '09:00' : times.length === 1 ? '21:00' : '14:00']);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({ ...f, times: times.filter(Boolean), newFiles: files, removeAttachmentIds: removed });
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <Field label="What do you want to remember?" htmlFor="mf-title" error={errors.title}>
        <input
          id="mf-title"
          className="input text-lg font-semibold"
          value={f.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder="e.g. Car insurance"
          maxLength={120}
          required
          {...err('title')}
        />
      </Field>

      <fieldset>
        <legend className="label">Category</legend>
        <div className="flex flex-wrap gap-2">
          {MEMORY_CATEGORIES.map((c) => (
            <button
              type="button"
              key={c.id}
              aria-pressed={f.categoryId === c.id}
              className="chip"
              onClick={() => setF((x) => ({ ...x, categoryId: c.id as CategoryId, subcategory: c.id === x.categoryId ? x.subcategory : '' }))}
            >
              <span aria-hidden="true">{c.emoji}</span>
              {c.name}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type" htmlFor="mf-subcategory">
          <select id="mf-subcategory" className="input" value={f.subcategory ?? ''} onChange={(e) => set('subcategory', e.target.value)}>
            <option value="">General</option>
            {subOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Due / expiry date" htmlFor="mf-dueDate" error={errors.dueDate}>
          <input id="mf-dueDate" type="date" className="input" value={f.dueDate ?? ''} onChange={(e) => set('dueDate', e.target.value || null)} {...err('dueDate')} />
        </Field>
        <Field
          label={isMedicine ? 'Dose times' : 'Time'}
          htmlFor={times.length ? 'mf-time-0' : 'mf-add-time'}
          error={errors.times}
          hint={times.length ? `We’ll alert you at ${times.length === 1 ? 'this time' : 'each time'}${f.repeat.frequency === 'daily' ? ' every day' : ' on the day'}.` : 'Optional. For medicines, meetings and appointments.'}
        >
          <div className="space-y-2">
            {times.map((tm, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  id={`mf-time-${i}`}
                  type="time"
                  className="input flex-1"
                  aria-label={isMedicine ? `Dose ${i + 1} time` : times.length > 1 ? `Time ${i + 1}` : undefined}
                  value={tm}
                  onChange={(e) => setTimes(times.map((x, j) => (j === i ? e.target.value : x)))}
                  {...err('times')}
                />
                <button type="button" className="grid size-11 place-items-center rounded-xl text-muted hover:bg-ink/5" aria-label={`Remove ${tm || 'time'}`} onClick={() => setTimes(times.filter((_, j) => j !== i))}>
                  <X className="size-4" />
                </button>
              </div>
            ))}
            {times.length < 8 && (
              <button id="mf-add-time" type="button" className="btn btn-secondary btn-sm" onClick={addTime}>
                {times.length ? <Plus className="size-4" aria-hidden="true" /> : <Clock className="size-4" aria-hidden="true" />}
                {times.length ? (isMedicine ? 'Add another dose' : 'Add another time') : isMedicine ? 'Add a dose time' : 'Add a time'}
              </button>
            )}
          </div>
        </Field>
        <Field
          label="Remind me"
          htmlFor="mf-reminder"
          error={errors.reminder}
          hint={f.reminder.mode === 'offset' && f.dueDate ? `On ${formatDate(addDays(f.dueDate, -f.reminder.offsetDays), { year: 'always' })}` : undefined}
        >
          <select id="mf-reminder" className="input" value={rKey} onChange={(e) => setReminder(e.target.value)} {...err('reminder')}>
            {REMINDER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
            {rKey === 'custom-offset' && f.reminder.mode === 'offset' && <option value="custom-offset">{f.reminder.offsetDays} days before</option>}
          </select>
          {f.reminder.mode === 'date' && (
            <input
              type="date"
              aria-label="Reminder date"
              className="input mt-2"
              value={f.reminder.date}
              max={f.dueDate ?? undefined}
              onChange={(e) => set('reminder', { mode: 'date', date: e.target.value })}
            />
          )}
        </Field>
        <Field label="Repeat" htmlFor="mf-repeat" error={errors.repeat}>
          <select id="mf-repeat" className="input" value={f.repeat.frequency} onChange={(e) => setRepeat(e.target.value as RepeatFrequency)} {...err('repeat')}>
            {(Object.keys(REPEAT_LABELS) as RepeatFrequency[]).map((k) => (
              <option key={k} value={k}>
                {REPEAT_LABELS[k]}
              </option>
            ))}
          </select>
          {f.repeat.frequency === 'custom' && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-sm text-muted">Every</span>
              <input
                type="number"
                min={1}
                max={999}
                aria-label="Repeat interval"
                className="input w-20"
                value={f.repeat.interval}
                onChange={(e) => set('repeat', { ...f.repeat, interval: Math.round(Number(e.target.value)) })}
              />
              <select aria-label="Repeat unit" className="input flex-1" value={f.repeat.unit} onChange={(e) => set('repeat', { ...f.repeat, unit: e.target.value as RepeatUnit })}>
                <option value="day">days</option>
                <option value="week">weeks</option>
                <option value="month">months</option>
                <option value="year">years</option>
              </select>
            </div>
          )}
        </Field>
      </div>

      <Field label="Description" htmlFor="mf-description" error={errors.description}>
        <input id="mf-description" className="input" value={f.description ?? ''} onChange={(e) => set('description', e.target.value)} placeholder="Policy number, provider, anything short" />
      </Field>

      <div className="rounded-2xl border border-line bg-surface">
        <button
          type="button"
          className="flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl px-4 text-left font-semibold text-ink-soft"
          aria-expanded={moreOpen}
          aria-controls="mf-more"
          onClick={() => setMoreOpen((o) => !o)}
        >
          More details
          <span className="flex items-center gap-2 text-sm font-normal text-muted">
            <span className="hidden sm:inline">Amount, person, place, notes, files</span>
            <ChevronDown className={cx('size-4 transition-transform', moreOpen && 'rotate-180')} aria-hidden="true" />
          </span>
        </button>
        {moreOpen && (
          <div id="mf-more" className="grid gap-4 border-t border-line p-4 animate-fade-in sm:grid-cols-2">
            <Field label="Amount (₹)" htmlFor="mf-amount" error={errors.amount}>
              <input
                id="mf-amount"
                className="input"
                inputMode="decimal"
                value={f.amount ?? ''}
                onChange={(e) => set('amount', e.target.value === '' ? null : Number(e.target.value.replace(/[^\d.]/g, '')))}
                placeholder="0"
                {...err('amount')}
              />
            </Field>
            <Field label="Person" htmlFor="mf-person" error={errors.personName}>
              <input id="mf-person" className="input" list="mf-people" value={f.personName ?? ''} onChange={(e) => set('personName', e.target.value)} placeholder="Who is it about?" />
              <datalist id="mf-people">
                {data.people.map((p) => (
                  <option key={p.id} value={p.name} />
                ))}
              </datalist>
            </Field>
            <Field label="Location" htmlFor="mf-location" error={errors.location} className="sm:col-span-2">
              <input id="mf-location" className="input" value={f.location ?? ''} onChange={(e) => set('location', e.target.value)} placeholder="e.g. Kitchen, Service centre" />
            </Field>
            <Field label="Notes" htmlFor="mf-notes" error={errors.notes} className="sm:col-span-2">
              <textarea id="mf-notes" rows={3} className="input py-3" value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} placeholder="Anything future-you will thank you for" />
            </Field>
            <div className="sm:col-span-2">
              <span className="label" id="mf-files-label">
                Attachments
              </span>
              <ul className="mb-2 space-y-1.5">
                {existingAttachments
                  .filter((a) => !removed.includes(a.id))
                  .map((a) => (
                    <li key={a.id} className="flex items-center gap-2 rounded-xl bg-paper px-3 py-2 text-sm">
                      <Paperclip className="size-4 text-muted" aria-hidden="true" />
                      <span className="flex-1 truncate">{a.name}</span>
                      <button type="button" className="rounded-lg p-1.5 text-muted hover:bg-ink/5" aria-label={`Remove ${a.name}`} onClick={() => setRemoved((r) => [...r, a.id])}>
                        <X className="size-4" />
                      </button>
                    </li>
                  ))}
                {files.map((file, i) => (
                  <li key={`${file.name}-${i}`} className="flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2 text-sm">
                    <Paperclip className="size-4 text-brand-600" aria-hidden="true" />
                    <span className="flex-1 truncate">{file.name}</span>
                    <button type="button" className="rounded-lg p-1.5 text-muted hover:bg-ink/5" aria-label={`Remove ${file.name}`} onClick={() => setFiles((fs) => fs.filter((_, j) => j !== i))}>
                      <X className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
              <label className="btn btn-secondary btn-sm cursor-pointer focus-within:shadow-focus">
                <Paperclip className="size-4" aria-hidden="true" />
                Attach a photo or PDF
                <input
                  type="file"
                  multiple
                  accept="image/*,application/pdf"
                  className="sr-only"
                  aria-labelledby="mf-files-label"
                  onChange={(e) => {
                    setFiles((fs) => [...fs, ...Array.from(e.target.files ?? [])]);
                    e.target.value = '';
                  }}
                />
              </label>
              <p className="mt-1.5 text-xs text-muted">Receipts, warranty cards, policy PDFs. Up to 1.5 MB each on this device.</p>
            </div>
          </div>
        )}
      </div>

      {shareWith && (
        <div className="flex items-start justify-between gap-4 rounded-2xl border border-line bg-surface p-4">
          <span>
            <span className="block font-semibold" id="mf-share-label">
              👨‍👩‍👧 {t('fam.shareThis')}
            </span>
            <span className="block text-sm text-muted">{t('fam.shareHint', { name: shareWith })}</span>
          </span>
          <Switch checked={!!f.shared} onChange={(v) => set('shared', v)} label={t('fam.shareThis')} />
        </div>
      )}

      <div>
        <span className="label">Status</span>
        <Segmented
          label="Status"
          value={f.status}
          onChange={(v) => set('status', v)}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'completed', label: 'Completed' },
            { value: 'archived', label: 'Archived' },
          ]}
        />
      </div>

      <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-10 -mx-4 flex gap-2 bg-gradient-to-t from-paper from-70% to-transparent px-4 pb-2 pt-5 lg:bottom-0">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary flex-1 sm:flex-none sm:px-8" disabled={saving}>
          {saving ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
