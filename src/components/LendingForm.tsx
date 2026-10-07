import { useEffect, useState, type FormEvent } from 'react';
import type { Lending } from '../types';
import { useData, useStore } from '../store/DataProvider';
import { ValidationError } from '../store/ZarooriStore';
import type { FieldErrors, LendingInput } from '../store/memoryInput';
import { addDays, todayISO } from '../lib/dates';
import { Modal } from './Modal';
import { useToast } from './Toast';
import { Field, Segmented } from './ui';

function initial(lending?: Lending, personName = '', preset: Partial<LendingInput> = {}): LendingInput {
  if (lending) {
    return {
      personName,
      direction: lending.direction,
      kind: lending.kind,
      amount: lending.amount ?? null,
      itemName: lending.itemName ?? '',
      date: lending.date,
      followUpDate: lending.followUpDate ?? '',
      notes: lending.notes ?? '',
    };
  }
  return {
    personName: '',
    direction: 'lent',
    kind: 'money',
    amount: null,
    itemName: '',
    date: todayISO(),
    followUpDate: addDays(todayISO(), 7),
    notes: '',
    ...preset,
  };
}

export function LendingFormModal({
  state,
  onClose,
}: {
  state: { lending?: Lending; preset?: Partial<LendingInput> } | null;
  onClose: () => void;
}) {
  const store = useStore();
  const data = useData();
  const toast = useToast();
  const lending = state?.lending;
  const personName = lending ? data.people.find((p) => p.id === lending.personId)?.name ?? '' : '';
  const [form, setForm] = useState<LendingInput>(() => initial(lending, personName, state?.preset));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (state) {
      setForm(initial(state.lending, personName, state.preset));
      setErrors({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const set = <K extends keyof LendingInput>(k: K, v: LendingInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (lending) await store.updateLending(lending.id, form);
      else await store.addLending(form);
      toast.success(lending ? 'Saved changes' : form.direction === 'lent' ? `Noted: ${form.personName.trim()} has it` : `Noted: borrowed from ${form.personName.trim()}`);
      onClose();
    } catch (err) {
      if (err instanceof ValidationError) setErrors(err.fields);
      else toast.error(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const err = (k: string) => ({ 'aria-invalid': !!errors[k], 'aria-describedby': errors[k] ? `lf-${k}-error` : undefined });

  return (
    <Modal
      open={!!state}
      onClose={onClose}
      title={lending ? 'Edit' : 'Lent or borrowed something?'}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="lending-form" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      }
    >
      <form id="lending-form" onSubmit={submit} noValidate className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Segmented
            label="Direction"
            value={form.direction}
            onChange={(v) => set('direction', v)}
            options={[
              { value: 'lent', label: 'I lent' },
              { value: 'borrowed', label: 'I borrowed' },
            ]}
          />
          <Segmented
            label="Money or thing"
            value={form.kind}
            onChange={(v) => set('kind', v)}
            options={[
              { value: 'money', label: '₹ Money' },
              { value: 'thing', label: '📦 Thing' },
            ]}
          />
        </div>
        <Field label={form.direction === 'lent' ? 'Who has it?' : 'Who did you borrow from?'} htmlFor="lf-personName" error={errors.personName}>
          <input
            id="lf-personName"
            className="input"
            list="lf-people"
            autoComplete="off"
            value={form.personName}
            onChange={(e) => set('personName', e.target.value)}
            placeholder="e.g. Rahul"
            data-autofocus
            {...err('personName')}
          />
          <datalist id="lf-people">
            {data.people.map((p) => (
              <option key={p.id} value={p.name} />
            ))}
          </datalist>
        </Field>
        {form.kind === 'money' ? (
          <Field label="Amount (₹)" htmlFor="lf-amount" error={errors.amount}>
            <input
              id="lf-amount"
              className="input"
              inputMode="decimal"
              value={form.amount ?? ''}
              onChange={(e) => set('amount', e.target.value === '' ? null : Number(e.target.value.replace(/[^\d.]/g, '')))}
              placeholder="2000"
              {...err('amount')}
            />
          </Field>
        ) : (
          <Field label="What is it?" htmlFor="lf-itemName" error={errors.itemName}>
            <input id="lf-itemName" className="input" value={form.itemName} onChange={(e) => set('itemName', e.target.value)} placeholder="e.g. Drill machine" {...err('itemName')} />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" htmlFor="lf-date" error={errors.date}>
            <input id="lf-date" type="date" className="input" value={form.date} onChange={(e) => set('date', e.target.value)} {...err('date')} />
          </Field>
          <Field label="Follow up on" htmlFor="lf-followUpDate" error={errors.followUpDate}>
            <input
              id="lf-followUpDate"
              type="date"
              className="input"
              value={form.followUpDate ?? ''}
              onChange={(e) => set('followUpDate', e.target.value)}
              {...err('followUpDate')}
            />
          </Field>
        </div>
        <Field label="Notes" htmlFor="lf-notes" error={errors.notes}>
          <textarea id="lf-notes" rows={2} className="input py-3" value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Anything to remember about it" />
        </Field>
      </form>
    </Modal>
  );
}
