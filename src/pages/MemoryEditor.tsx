import { useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { CategoryId } from '../types';
import { MemoryForm } from '../components/MemoryForm';
import { QuickAdd } from '../components/QuickAdd';
import { useToast } from '../components/Toast';
import { EmptyState, PageHeader } from '../components/ui';
import { REPEAT_PRESETS, formatDate } from '../lib/dates';
import { MEMORY_CATEGORIES } from '../lib/categories';
import type { ParsedQuickAdd } from '../lib/parser';
import type { MemoryView } from '../lib/selectors';
import { useStore, useViews } from '../store/DataProvider';
import { ValidationError } from '../store/LifeBoxStore';
import type { FieldErrors, MemoryInput } from '../store/memoryInput';

function blank(categoryId: CategoryId = 'personal', defaultReminder = 1): MemoryInput {
  return {
    title: '',
    categoryId,
    subcategory: '',
    dueDate: null,
    reminder: { mode: 'offset', offsetDays: defaultReminder },
    repeat: { ...REPEAT_PRESETS.never },
    status: 'active',
  };
}

function fromParsed(p: ParsedQuickAdd, defaultReminder: number): MemoryInput {
  return {
    ...blank(p.categoryId === 'people' || p.categoryId === 'shopping' ? 'personal' : p.categoryId, defaultReminder),
    title: p.title,
    subcategory: p.subcategory ?? '',
    dueDate: p.dueDate,
    reminder: p.dueDate ? { mode: 'offset', offsetDays: p.reminderDaysBefore ?? defaultReminder } : { mode: 'none' },
    repeat: p.repeat,
    amount: p.amount,
    source: 'quick_add',
  };
}

function fromView(m: MemoryView): MemoryInput {
  const r = m.reminder;
  return {
    title: m.title,
    description: m.description ?? '',
    categoryId: m.categoryId,
    subcategory: m.subcategory ?? '',
    dueDate: m.dueDate ?? null,
    reminder: !r ? { mode: 'none' } : r.offsetDays != null && m.dueDate ? { mode: 'offset', offsetDays: r.offsetDays } : { mode: 'date', date: r.remindOn },
    repeat: m.recurrence ? { frequency: m.recurrence.frequency, interval: m.recurrence.interval, unit: m.recurrence.unit } : { ...REPEAT_PRESETS.never },
    status: m.status,
    amount: m.amount ?? null,
    personName: m.person?.name ?? '',
    location: m.location ?? '',
    notes: m.notes ?? '',
  };
}

function useSave() {
  const toast = useToast();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setSaving(true);
    setErrors({});
    try {
      await fn();
      return true;
    } catch (e) {
      if (e instanceof ValidationError) {
        setErrors(e.fields);
        document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      } else toast.error(e instanceof Error ? e.message : 'Could not save.');
      return false;
    } finally {
      setSaving(false);
    }
  };
  return { errors, saving, run };
}

export function AddMemory() {
  const store = useStore();
  const navigate = useNavigate();
  const toast = useToast();
  const location = useLocation();
  const [params] = useSearchParams();
  const parsed = (location.state as { parsed?: ParsedQuickAdd } | null)?.parsed;
  const catParam = params.get('category') as CategoryId | null;
  const defaultReminder = store.settings.defaultReminderDays;
  const initial = parsed
    ? fromParsed(parsed, defaultReminder)
    : blank(catParam && MEMORY_CATEGORIES.some((c) => c.id === catParam) ? catParam : 'personal', defaultReminder);
  const { errors, saving, run } = useSave();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Add a memory" subtitle="Type it in one line, or fill in the details below." />
      {!parsed && (
        <div className="mb-6">
          <QuickAdd variant="compact" />
          <div className="my-6 flex items-center gap-3 text-sm text-muted" aria-hidden="true">
            <span className="h-px flex-1 bg-line" /> or fill in the details <span className="h-px flex-1 bg-line" />
          </div>
        </div>
      )}
      <div className="card p-4 sm:p-6">
        <MemoryForm
          key={location.key}
          initial={initial}
          errors={errors}
          saving={saving}
          submitLabel="Save memory"
          onCancel={() => navigate(-1)}
          onSubmit={async (input) => {
            const ok = await run(async () => {
              const m = await store.addMemory({ ...input, source: input.source ?? 'manual' });
              toast.success(m.dueDate ? `Saved. We’ll remind you before ${formatDate(m.dueDate)}` : 'Saved to your LifeBox');
            });
            if (ok) navigate('/app');
          }}
        />
      </div>
    </div>
  );
}

export function EditMemory() {
  const { id } = useParams();
  const { memories } = useViews();
  const store = useStore();
  const navigate = useNavigate();
  const toast = useToast();
  const { errors, saving, run } = useSave();
  const m = memories.find((x) => x.id === id);
  // Capture the initial values once so live updates don't reset the form.
  const [initial] = useState(() => (m ? fromView(m) : null));

  if (!m || !initial) {
    return <EmptyState emoji="🔍" title="We couldn’t find that memory" body="It may have been deleted." />;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Edit memory" subtitle={m.title} />
      <div className="card p-4 sm:p-6">
        <MemoryForm
          initial={initial}
          existingAttachments={m.attachments}
          errors={errors}
          saving={saving}
          submitLabel="Save changes"
          onCancel={() => navigate(-1)}
          onSubmit={async (input) => {
            const ok = await run(async () => {
              await store.updateMemory(m.id, input);
              toast.success('Changes saved');
            });
            if (ok) navigate(-1);
          }}
        />
      </div>
    </div>
  );
}
