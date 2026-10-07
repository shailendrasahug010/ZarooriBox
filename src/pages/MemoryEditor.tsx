import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, Sparkles } from 'lucide-react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { CategoryId } from '../types';
import { MemoryForm } from '../components/MemoryForm';
import { QuickAdd } from '../components/QuickAdd';
import { useToast } from '../components/Toast';
import { EmptyState, PageHeader } from '../components/ui';
import { REPEAT_PRESETS, formatDate, todayISO } from '../lib/dates';
import { MEMORY_CATEGORIES, getCategory } from '../lib/categories';
import type { ParsedQuickAdd } from '../lib/parser';
import type { MemoryView } from '../lib/selectors';
import { useStore, useViews } from '../store/DataProvider';
import { ValidationError } from '../store/ZarooriStore';
import type { FieldErrors, MemoryInput } from '../store/memoryInput';
import { isScannable, scanDocument, type ScanOutcome } from '../lib/scan';
import { can } from '../lib/plans';
import { useT } from '../i18n';

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

/** Sensible starting points for the Add screen's ?category=…&type=… links. */
function blankFor(categoryId: CategoryId, sub: string | null, defaultReminder: number): MemoryInput {
  const b = blank(categoryId, defaultReminder);
  const type = sub && getCategory(categoryId).subcategories.includes(sub) ? sub : '';
  if (categoryId === 'health' && type === 'Medicines') {
    // A medicine: every day from today, with a first dose time to adjust.
    return { ...b, subcategory: type, dueDate: todayISO(), times: ['09:00'], repeat: { ...REPEAT_PRESETS.daily }, reminder: { mode: 'offset', offsetDays: 0 } };
  }
  return { ...b, subcategory: type };
}

function fromParsed(p: ParsedQuickAdd, defaultReminder: number): MemoryInput {
  return {
    ...blank(p.categoryId === 'people' || p.categoryId === 'shopping' ? 'personal' : p.categoryId, defaultReminder),
    title: p.title,
    subcategory: p.subcategory ?? '',
    dueDate: p.dueDate,
    times: p.times,
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
    times: m.dueTimes ?? [],
    reminder: !r ? { mode: 'none' } : r.offsetDays != null && m.dueDate ? { mode: 'offset', offsetDays: r.offsetDays } : { mode: 'date', date: r.remindOn },
    repeat: m.recurrence ? { frequency: m.recurrence.frequency, interval: m.recurrence.interval, unit: m.recurrence.unit } : { ...REPEAT_PRESETS.never },
    status: m.status,
    amount: m.amount ?? null,
    personName: m.person?.name ?? '',
    location: m.location ?? '',
    notes: m.notes ?? '',
    shared: !!m.householdId,
  };
}

/** Picks or takes a photo of a document to scan. */
function ScanPicker({ onFile }: { onFile: (f: File) => void }) {
  const t = useT();
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) onFile(f);
  };
  return (
    <div className="card mb-6 p-5 text-center">
      <span className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-700" aria-hidden="true">
        <Camera className="size-6" />
      </span>
      <h2 className="font-bold">{t('scan.title')}</h2>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{t('scan.help')}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <label className="btn btn-primary cursor-pointer focus-within:shadow-focus">
          <Camera className="size-4" aria-hidden="true" /> {t('scan.take')}
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={pick} />
        </label>
        <label className="btn btn-secondary cursor-pointer focus-within:shadow-focus">
          <ImagePlus className="size-4" aria-hidden="true" /> {t('scan.pick')}
          <input type="file" accept="image/*" className="sr-only" onChange={pick} />
        </label>
      </div>
    </div>
  );
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
  const t = useT();
  const [params] = useSearchParams();
  const state = location.state as { parsed?: ParsedQuickAdd; scanFile?: File } | null;
  const parsed = state?.parsed;
  const catParam = params.get('category') as CategoryId | null;
  const defaultReminder = store.settings.defaultReminderDays;
  const base = parsed
    ? fromParsed(parsed, defaultReminder)
    : blankFor(catParam && MEMORY_CATEGORIES.some((c) => c.id === catParam) ? catParam : 'personal', params.get('type'), defaultReminder);
  const { errors, saving, run } = useSave();

  // Document scanning: a photo from the camera button, the Add page or Share to ZarooriBox.
  const [scanFile, setScanFile] = useState<File | null>(state?.scanFile ?? null);
  const [scan, setScan] = useState<{ outcome: ScanOutcome; input: MemoryInput; files: File[]; n: number } | null>(null);
  const scanning = !!scanFile && !scan;
  const scanned = useRef<File | null>(null);
  useEffect(() => {
    if (!scanFile || scanned.current === scanFile) return;
    scanned.current = scanFile;
    if (!isScannable(scanFile)) {
      toast.error(t('scan.notImage'));
      setScanFile(null);
      return;
    }
    void scanDocument(scanFile, defaultReminder).then((r) => {
      const files = can(store.settings.plan, 'attachments') ? [scanFile] : [];
      setScan((prev) => ({ outcome: r.outcome, input: { ...blank('documents', defaultReminder), ...r.fields }, files, n: (prev?.n ?? 0) + 1 }));
    });
  }, [scanFile, defaultReminder, store, toast, t]);

  const initial = scan?.input ?? base;
  const family = store.family;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Add a memory" subtitle="Type it in one line, or fill in the details below." />
      {params.get('scan') === '1' && !scanFile && <ScanPicker onFile={(f) => { setScan(null); setScanFile(f); }} />}
      {scanning && (
        <div className="card mb-6 flex items-center gap-3 p-5" role="status" aria-busy="true">
          <Sparkles className="size-5 animate-pulse text-brand-600" aria-hidden="true" />
          <span className="font-semibold">{t('scan.reading')}</span>
        </div>
      )}
      {scan && (
        <p className={`mb-4 rounded-2xl p-3.5 text-sm font-medium ${scan.outcome === 'found' ? 'bg-brand-50 text-brand-800' : 'bg-soon-bg text-soon'}`} role="status">
          {scan.outcome === 'found' ? t('scan.found') : scan.outcome === 'no_ai' ? t(scan.files.length ? 'scan.noAi' : 'scan.noAiBare') : t('scan.notFound')}
        </p>
      )}
      {!parsed && !scanFile && params.get('scan') !== '1' && (
        <div className="mb-6">
          <QuickAdd variant="compact" />
          <div className="my-6 flex items-center gap-3 text-sm text-muted" aria-hidden="true">
            <span className="h-px flex-1 bg-line" /> or fill in the details <span className="h-px flex-1 bg-line" />
          </div>
        </div>
      )}
      <div className="card p-4 sm:p-6">
        {!scanning && (
        <MemoryForm
          key={`${location.key}-${scan?.n ?? 0}`}
          initial={initial}
          initialFiles={scan?.files}
          shareWith={family?.name}
          errors={errors}
          saving={saving}
          submitLabel="Save memory"
          onCancel={() => navigate(-1)}
          onSubmit={async (input) => {
            const ok = await run(async () => {
              const m = await store.addMemory({ ...input, source: input.source ?? 'manual' });
              toast.success(m.dueDate ? `Saved. We’ll remind you before ${formatDate(m.dueDate)}` : 'Saved to your ZarooriBox');
            });
            if (ok) navigate('/app');
          }}
        />
        )}
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
          shareWith={store.family && m.userId === store.user.id ? store.family.name : undefined}
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
