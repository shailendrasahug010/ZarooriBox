import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Check, CalendarClock, CalendarPlus } from 'lucide-react';
import { useToast } from '../components/Toast';
import { useUI } from '../components/UIProvider';
import { Logo } from '../components/ui';
import { getSupabase, isSupabaseConfigured } from '../data/supabase';
import { useT } from '../i18n';
import type { ReminderAction } from '../store/ZarooriStore';
import { useStore } from '../store/DataProvider';

const ACTIONS: ReminderAction[] = ['done', 'tomorrow', 'week'];

/**
 * /app/act?kind=memory&id=…&do=done: where taps on notification buttons land.
 * Runs the action, shows a toast and goes home. "do=open" just opens the item.
 */
export function InAppAct() {
  const [params] = useSearchParams();
  const store = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const { openMemory } = useUI();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const kind = params.get('kind') === 'lending' ? 'lending' : 'memory';
    const id = params.get('id') ?? '';
    const what = params.get('do') ?? 'open';
    if (what === 'open' || !ACTIONS.includes(what as ReminderAction)) {
      navigate(kind === 'lending' ? '/app/people' : '/app', { replace: true });
      if (kind === 'memory' && id) openMemory(id);
      return;
    }
    store
      .act({ kind, id }, what as ReminderAction)
      .then((msg) => toast.success(msg))
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : 'Something went wrong.'))
      .finally(() => navigate('/app', { replace: true }));
  }, [params, store, toast, navigate, openMemory]);

  return <div className="h-40" aria-busy="true" />;
}

type State = { phase: 'loading' } | { phase: 'choose'; title: string } | { phase: 'done'; message: string } | { phase: 'error'; message: string };

async function call(body: Record<string, unknown>) {
  const { data, error } = await getSupabase().functions.invoke('reminder-action', { body });
  if (error) {
    let message = '';
    try {
      message = (await (error as { context?: Response }).context?.json())?.error ?? '';
    } catch {
      /* generic message */
    }
    throw new Error(message || 'failed');
  }
  return data as { title?: string; message?: string };
}

/**
 * /act?t=…&do=done: the Done / Tomorrow / Next week links in reminder emails. Works
 * without signing in, because the signed token names the person and the item.
 * The action only runs from this page's script, so email link scanners can't trigger it.
 */
export function PublicAct() {
  const [params] = useSearchParams();
  const t = useT();
  const token = params.get('t') ?? '';
  const initial = params.get('do');
  const [state, setState] = useState<State>({ phase: 'loading' });
  const ran = useRef(false);

  const run = async (action: ReminderAction) => {
    setState({ phase: 'loading' });
    try {
      const r = await call({ token, action });
      setState({ phase: 'done', message: r.message ?? t('set.saved') });
    } catch (e) {
      setState({ phase: 'error', message: e instanceof Error && e.message !== 'failed' ? e.message : t('act.page.failed') });
    }
  };

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (!token || !isSupabaseConfigured) {
      setState({ phase: 'error', message: t('act.page.expired') });
      return;
    }
    if (initial && ACTIONS.includes(initial as ReminderAction)) {
      void run(initial as ReminderAction);
      return;
    }
    call({ token })
      .then((r) => setState({ phase: 'choose', title: r.title ?? '' }))
      .catch((e: Error) => setState({ phase: 'error', message: e.message !== 'failed' ? e.message : t('act.page.expired') }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="grid min-h-dvh place-items-center bg-paper p-5">
      <div className="card w-full max-w-sm p-6 text-center animate-fade-up">
        <Logo className="mb-5 justify-center" />
        <h1 className="sr-only">{t('act.page.title')}</h1>
        {state.phase === 'loading' && (
          <p className="text-muted" aria-busy="true" role="status">
            {t('act.page.working')}
          </p>
        )}
        {state.phase === 'choose' && (
          <>
            <p className="text-lg font-bold text-ink">{state.title}</p>
            <p className="mt-1 text-muted">{t('act.page.choose')}</p>
            <div className="mt-5 grid gap-2">
              <button type="button" className="btn btn-primary" onClick={() => run('done')}>
                <Check className="size-4" /> {t('act.done')}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => run('tomorrow')}>
                <CalendarClock className="size-4" /> {t('act.tomorrow')}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => run('week')}>
                <CalendarPlus className="size-4" /> {t('act.week')}
              </button>
            </div>
          </>
        )}
        {state.phase === 'done' && (
          <p className="text-lg font-semibold text-ink" role="status">
            <span className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-brand-600 text-white" aria-hidden="true">
              <Check className="size-6" strokeWidth={3} />
            </span>
            {state.message}
          </p>
        )}
        {state.phase === 'error' && (
          <p className="text-ink-soft" role="alert">
            {state.message}
          </p>
        )}
        <Link to="/app" className="btn btn-ghost mt-5">
          {t('act.page.open')}
        </Link>
      </div>
    </main>
  );
}
