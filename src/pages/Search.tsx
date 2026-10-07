import { useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Mic, Search as SearchIcon, Square, X } from 'lucide-react';
import { useT } from '../i18n';
import { VOICE_ERROR_TEXT, getVoiceInput, voiceLangFor, type VoiceSession } from '../lib/voice';
import { useToast } from '../components/Toast';
import { useStore } from '../store/DataProvider';
import { MemoryRow } from '../components/MemoryRow';
import { useUI } from '../components/UIProvider';
import { EmptyState, PageHeader } from '../components/ui';
import { searchAll } from '../lib/search';
import { useViews } from '../store/DataProvider';
import { lendingTitle } from './Dashboard';

const SUGGESTIONS = ['insurance', 'bill', 'Rahul', 'warranty', 'service', 'milk'];

export default function Search() {
  const { data, memories, lendings } = useViews();
  const { openLendingForm } = useUI();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const results = useMemo(() => searchAll(q, memories, lendings, data.shopping), [q, memories, lendings, data.shopping]);
  const setQ = (v: string) => setParams(v ? { q: v } : {}, { replace: true });
  const t = useT();
  const toast = useToast();
  const store = useStore();
  const voice = useMemo(() => getVoiceInput(), []);
  const [listening, setListening] = useState(false);
  const session = useRef<VoiceSession | null>(null);
  const listen = async () => {
    if (listening) return session.current?.stop();
    setListening(true);
    session.current = await voice.start(
      {
        onPartial: (heard) => setQ(heard),
        onEnd: (heard) => {
          setListening(false);
          if (heard) setQ(heard.replace(/[.?!]$/, ''));
        },
        onError: (e) => {
          setListening(false);
          toast.error(VOICE_ERROR_TEXT[e]);
        },
      },
      voiceLangFor(store.settings, t.lang),
    );
    if (!session.current) setListening(false);
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t('search.title')} />
      <div role="search" className="relative mb-5">
        <label htmlFor="search-input" className="sr-only">
          Search everything in ZarooriBox
        </label>
        <SearchIcon className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input
          id="search-input"
          type="search"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('search.placeholder')}
          className="input h-14 rounded-2xl pl-12 pr-24 text-lg shadow-card"
          autoComplete="off"
        />
        <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center">
          {q && (
            <button type="button" className="icon-btn" aria-label="Clear search" onClick={() => setQ('')}>
              <X className="size-5" />
            </button>
          )}
          {voice.isSupported() && (
            <button
              type="button"
              className={listening ? 'icon-btn bg-attn text-white hover:bg-attn' : 'icon-btn'}
              aria-pressed={listening}
              aria-label={t('search.voice')}
              title={t('search.voice')}
              onClick={listen}
            >
              {listening ? <Square className="size-4 fill-current" /> : <Mic className="size-5" />}
            </button>
          )}
        </div>
      </div>

      {!q.trim() ? (
        <div className="animate-fade-in">
          <p className="mb-2 text-sm font-semibold text-muted">Try</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" className="chip" onClick={() => setQ(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : results.total === 0 ? (
        <div className="card">
          <EmptyState emoji="🔍" title={`Nothing found for “${q}”`} body="Try a shorter word, a person’s name or a category like “home”." />
        </div>
      ) : (
        <div className="space-y-4" aria-live="polite">
          <p className="text-sm text-muted">
            {results.total} result{results.total === 1 ? '' : 's'}
          </p>
          {results.memories.length > 0 && (
            <section className="card p-4" aria-label="Memories">
              <h2 className="section-title mb-1">Memories</h2>
              <ul className="-mx-2">
                {results.memories.map((m) => (
                  <MemoryRow key={m.id} m={m} showCheck={false} />
                ))}
              </ul>
            </section>
          )}
          {results.lendings.length > 0 && (
            <section className="card p-4" aria-label="People and things">
              <h2 className="section-title mb-1">People & Things</h2>
              <ul className="-mx-1">
                {results.lendings.map((l) => (
                  <li key={l.id}>
                    <button type="button" className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 text-left hover:bg-paper" onClick={() => openLendingForm({ lending: l })}>
                      <span className="grid size-8 place-items-center rounded-full bg-brand-50 text-sm font-bold text-brand-700" aria-hidden="true">
                        {(l.person?.name ?? '?').slice(0, 1)}
                      </span>
                      <span className="flex-1 font-semibold">{lendingTitle(l)}</span>
                      {l.status === 'returned' && <span className="text-xs text-muted">Returned</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {results.shopping.length > 0 && (
            <section className="card p-4" aria-label="Shopping">
              <h2 className="section-title mb-1">Shopping</h2>
              <ul>
                {results.shopping.map((s) => (
                  <li key={s.id} className="flex min-h-11 items-center justify-between gap-2 px-1">
                    <span className={s.purchased ? 'text-muted line-through' : 'font-medium'}>{s.name}</span>
                    <Link to="/app/shopping" className="text-sm font-semibold text-brand-700">
                      {s.listCategory}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
