import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CornerDownLeft, Mic, SlidersHorizontal, Sparkles, Square } from 'lucide-react';
import { aiQuickAddEnabled, parseQuickAdd, quickAddParser, type ParsedQuickAdd } from '../lib/parser';
import { VOICE_ERROR_TEXT, getVoiceInput, type VoiceSession } from '../lib/voice';
import { getCategory } from '../lib/categories';
import { describeRepeat, formatDate, relativeLabel, todayISO } from '../lib/dates';
import { formatMoney } from '../lib/format';
import { useStore } from '../store/DataProvider';
import { useToast } from './Toast';
import { useUI } from './UIProvider';
import { cx } from './ui';

const EXAMPLES = [
  'Bike insurance expires on 17 November',
  'I lent Rahul ₹2000 today',
  'RO filter change every 6 months',
  'Buy milk, bread and eggs',
  'Mom’s birthday on 14 March',
  'Netflix renews on the 22nd',
  'Borrowed a ladder from Amit',
];

function reminderText(p: ParsedQuickAdd) {
  if (p.reminderDaysBefore == null || !p.dueDate) return null;
  return p.reminderDaysBefore === 0 ? 'On the day' : `${p.reminderDaysBefore} day${p.reminderDaysBefore === 1 ? '' : 's'} before`;
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-2.5 py-1.5 text-[0.82rem] shadow-[0_0_0_1px_var(--color-line)]">
      <span className="text-muted">{label}</span>
      <span className="font-semibold text-ink">{value}</span>
    </span>
  );
}

/** What the parser understood, shown live while typing. */
function Preview({ p, ai }: { p: ParsedQuickAdd; ai?: boolean }) {
  const chips: [string, string][] = [];
  if (p.kind === 'shopping') {
    chips.push(['List', p.shoppingItems?.[0]?.listCategory ?? 'Grocery']);
    for (const i of p.shoppingItems ?? []) chips.push(['Item', i.quantity ? `${i.name} · ${i.quantity}` : i.name]);
  } else if (p.kind === 'lending') {
    chips.push(['Category', p.direction === 'lent' ? 'Lent' : 'Borrowed']);
    if (p.person) chips.push(['Person', p.person]);
    if (p.amount != null) chips.push(['Amount', formatMoney(p.amount)]);
    if (p.thing) chips.push(['Item', p.thing]);
    if (p.dueDate) chips.push(['Date', p.dueDate === todayISO() ? 'Today' : formatDate(p.dueDate)]);
    if (p.followUpDate) chips.push(['Follow up', formatDate(p.followUpDate)]);
  } else {
    chips.push(['Category', p.subcategory ? `${getCategory(p.categoryId).name} · ${p.subcategory}` : getCategory(p.categoryId).name]);
    if (p.dueDate) chips.push(['Date', `${formatDate(p.dueDate, { year: 'always' })} (${relativeLabel(p.dueDate)})`]);
    const r = reminderText(p);
    if (r) chips.push(['Reminder', r]);
    if (p.repeat.frequency !== 'never') chips.push(['Repeats', describeRepeat(p.repeat)]);
    if (p.amount != null) chips.push(['Amount', formatMoney(p.amount)]);
  }
  const icon = p.kind === 'shopping' ? '🛒' : p.kind === 'lending' ? '👥' : getCategory(p.categoryId).emoji;
  return (
    <div className="mt-3 rounded-2xl bg-paper/90 p-3 animate-fade-in" aria-live="polite">
      <p className="mb-2 flex items-center gap-2 text-[0.95rem] font-bold text-ink">
        <span aria-hidden="true">{icon}</span>
        <span className="truncate">{p.kind === 'shopping' ? 'Add to shopping list' : p.title}</span>
        {ai && (
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700" title="Understood by AI">
            <Sparkles className="size-3" aria-hidden="true" /> AI
          </span>
        )}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {chips.map(([l, v], i) => (
          <Chip key={`${l}-${i}`} label={l} value={v} />
        ))}
      </div>
    </div>
  );
}

export function QuickAdd({ variant = 'hero', autoFocus = false }: { variant?: 'hero' | 'compact'; autoFocus?: boolean }) {
  const store = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const { openLendingForm } = useUI();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(false);
  const [exampleIdx, setExampleIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  // AI result for the exact text currently typed, fetched after typing pauses.
  const [aiPreview, setAiPreview] = useState<{ text: string; parsed: ParsedQuickAdd } | null>(null);
  const voice = useMemo(() => getVoiceInput(), []);
  const [listening, setListening] = useState(false);
  const voiceRef = useRef<VoiceSession | null>(null);

  useEffect(() => () => voiceRef.current?.stop(), []);

  useEffect(() => {
    if (text) return;
    const t = window.setInterval(() => setExampleIdx((i) => (i + 1) % EXAMPLES.length), 3200);
    return () => window.clearInterval(t);
  }, [text]);

  const rulePreview = useMemo(
    () => (text.trim().length >= 3 ? parseQuickAdd(text, { today: todayISO(), currency: store.settings.currency }) : null),
    [text, store],
  );
  const aiMatches = !!aiPreview && aiPreview.text === text.trim();
  const preview = aiMatches ? aiPreview.parsed : rulePreview;

  useEffect(() => {
    const value = text.trim();
    if (!aiQuickAddEnabled || listening || value.length < 6 || value.length > 300) return;
    let cancelled = false;
    const t = window.setTimeout(async () => {
      const parsed = aiMatches ? aiPreview!.parsed : await quickAddParser.parse(value, { today: todayISO(), currency: store.settings.currency });
      if (!cancelled && parsed.source === 'ai') setAiPreview({ text: value, parsed });
    }, 900);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [text, listening, store]);

  const toggleVoice = async () => {
    if (listening) {
      voiceRef.current?.stop();
      return;
    }
    const before = text;
    setListening(true);
    const session = await voice.start({
      onPartial: (heard) => setText(heard),
      onEnd: (heard) => {
        voiceRef.current = null;
        setListening(false);
        setText(heard || before);
        inputRef.current?.focus();
      },
      onError: (err) => {
        voiceRef.current = null;
        setListening(false);
        setText(before);
        toast.error(VOICE_ERROR_TEXT[err]);
      },
    });
    if (session) voiceRef.current = session;
    else setListening(false);
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const value = text.trim();
    if (listening) voiceRef.current?.stop();
    if (!value || busy) {
      inputRef.current?.focus();
      return;
    }
    if (value.length > 300) {
      toast.error('That’s a bit long for Quick Add. Try “Add details” instead.');
      return;
    }
    setBusy(true);
    try {
      const parsed = aiMatches ? aiPreview!.parsed : await quickAddParser.parse(value, { today: todayISO(), currency: store.settings.currency });
      const res = await store.applyQuickAdd(parsed);
      setText('');
      setAiPreview(null);
      setFlash(true);
      window.setTimeout(() => setFlash(false), 900);
      const undo =
        res.kind === 'memory' && res.id
          ? { label: 'Undo', onClick: () => void store.deleteMemory(res.id!) }
          : res.kind === 'lending' && res.id
            ? { label: 'Undo', onClick: () => void store.deleteLending(res.id!) }
            : undefined;
      toast.success(res.message, undo);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add that.');
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const openDetails = () => {
    if (preview?.kind === 'lending') {
      openLendingForm({
        preset: {
          personName: preview.person ?? '',
          direction: preview.direction,
          kind: preview.lendingKind,
          amount: preview.amount,
          itemName: preview.thing ?? '',
          date: preview.dueDate ?? todayISO(),
          followUpDate: preview.followUpDate ?? '',
        },
      });
      return;
    }
    if (preview?.kind === 'shopping') {
      navigate('/app/shopping', { state: { prefill: preview.shoppingItems } });
      return;
    }
    navigate('/app/add', { state: { parsed: preview } });
  };

  const hero = variant === 'hero';
  return (
    <form onSubmit={submit} className={cx('card relative p-3 sm:p-4', flash && 'ring-2 ring-brand-300 transition-shadow')} aria-label="Quick add">
      <div className="flex items-center gap-2">
        <span className={cx('grid shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600', hero ? 'size-11' : 'size-10')} aria-hidden="true">
          <Sparkles className={cx('size-5 transition-transform', flash && 'animate-pop')} />
        </span>
        <label htmlFor="quick-add-input" className="sr-only">
          Quick add: type anything you want to remember
        </label>
        <input
          id="quick-add-input"
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus={autoFocus}
          autoComplete="off"
          enterKeyHint="done"
          aria-describedby={hintId}
          maxLength={300}
          placeholder={listening ? 'Listening… say what you want to remember' : `Try “${EXAMPLES[exampleIdx]}”`}
          className={cx(
            'min-w-0 flex-1 bg-transparent font-medium text-ink outline-none placeholder:font-normal placeholder:text-muted/80',
            hero ? 'min-h-12 text-[1.05rem] sm:text-lg' : 'min-h-11 text-base',
          )}
        />
        {voice.isSupported() && (
          <button
            type="button"
            onClick={toggleVoice}
            aria-pressed={listening}
            aria-label={listening ? 'Stop listening' : 'Add by voice'}
            title={listening ? 'Stop listening' : 'Add by voice'}
            className={cx(
              'relative grid shrink-0 place-items-center rounded-xl transition',
              hero ? 'size-11' : 'size-10',
              listening ? 'bg-attn text-white' : 'bg-paper text-ink-soft hover:bg-brand-50 hover:text-brand-700',
            )}
          >
            {listening && <span className="absolute inset-0 animate-ping rounded-xl bg-attn/40" aria-hidden="true" />}
            {listening ? <Square className="relative size-4 fill-current" /> : <Mic className="size-5" />}
          </button>
        )}
        <button type="submit" className={cx('btn btn-primary shrink-0', !hero && 'btn-sm')} disabled={busy} aria-label="Add">
          <span className="hidden sm:inline">Add</span>
          <ArrowRight className="size-4 sm:hidden" />
          <CornerDownLeft className="hidden size-4 opacity-70 sm:block" />
        </button>
      </div>
      <p id={hintId} className="sr-only">
        Type or say a sentence like “Car insurance expires 12 February 2027”. LifeBox works out the date, category and reminder. Press Enter to save.
      </p>
      {preview && (
        <>
          <Preview p={preview} ai={aiMatches} />
          <div className="mt-2 flex items-center justify-between gap-2 px-1">
            <span className="text-xs text-muted">{listening ? 'Listening… tap ■ when you’re done' : 'Press Enter or tap Add to save'}</span>
            <button type="button" onClick={openDetails} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-brand-700 hover:bg-brand-50">
              <SlidersHorizontal className="size-4" aria-hidden="true" />
              Add details
            </button>
          </div>
        </>
      )}
    </form>
  );
}
