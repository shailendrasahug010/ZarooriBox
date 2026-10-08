import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { createRepository } from '../data';
import { deviceChannel } from '../lib/notifications/channels';
import { isNativeApp, syncNativeSchedule } from '../lib/notifications/native';
import { syncWidget } from '../lib/widget';
import { todayISO } from '../lib/dates';
import { buildLendingViews, buildMemoryViews } from '../lib/selectors';
import { getLanguage, setLanguage } from '../i18n';
import type { UserData } from '../types';
import { ZarooriStore } from './ZarooriStore';

const StoreContext = createContext<ZarooriStore | null>(null);

const CHECK_EVERY_MS = 60_000;

export function DataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [store, setStore] = useState<ZarooriStore | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const s = new ZarooriStore(createRepository(user.id, user.onDevice), user);
    s.init()
      .then(() => !cancelled && setStore(s))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
      setStore(null);
    };
  }, [user]);

  // Reminder loop: create in-app notifications and, if allowed, a browser pop-up.
  useEffect(() => {
    if (!store) return;
    const check = async () => {
      try {
        const fired = await store.runReminderCheck();
        // The phone app schedules its alerts with the OS (below), so no duplicate pop-up here.
        if (!fired.length || !store.settings.notifications.browser || isNativeApp()) return;
        if (fired.length === 1) {
          const f = fired[0];
          const target = f.memoryId ? { kind: 'memory' as const, id: f.memoryId } : f.lendingId ? { kind: 'lending' as const, id: f.lendingId } : undefined;
          await deviceChannel.send({ title: f.title, body: f.body, tag: `zaroori-${f.dueDate}`, url: '/app', target });
        } else {
          await deviceChannel.send({ title: `ZarooriBox: ${fired.length} things need you`, body: fired.slice(0, 3).map((f) => f.title).join(', '), tag: 'zaroori-digest', url: '/app' });
        }
      } catch {
        // A failed check retries on the next tick.
      }
    };
    check();
    const t = window.setInterval(check, CHECK_EVERY_MS);
    return () => window.clearInterval(t);
  }, [store]);

  // Android home-screen widget: keep its "Today" list current, including after midnight.
  useEffect(() => {
    if (!store) return;
    const apply = () => syncWidget(store.getSnapshot(), todayISO());
    apply();
    const unsubscribe = store.subscribe(apply);
    const onVisible = () => document.visibilityState === 'visible' && apply();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [store]);

  // The app speaks the language saved in the person's settings.
  useEffect(() => {
    if (!store) return;
    const apply = () => {
      const lang = store.settings.language;
      if (lang && lang !== getLanguage()) setLanguage(lang);
    };
    apply();
    const unsubscribe = store.subscribe(apply);
    return () => {
      unsubscribe();
    };
  }, [store]);

  // Cloud accounts: pick up changes from family members and other devices when the
  // app comes back to the foreground, and every couple of minutes while in a family.
  useEffect(() => {
    if (!store || store.mode !== 'supabase') return;
    const refresh = () => {
      if (document.visibilityState === 'visible') void store.reload().catch(() => {});
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    const t = window.setInterval(() => store.family && refresh(), 120_000);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
      window.clearInterval(t);
    };
  }, [store]);

  // Phone app: keep the OS notification schedule in step with the data.
  useEffect(() => {
    if (!store || !isNativeApp()) return;
    let t: number | undefined;
    const sync = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => void syncNativeSchedule(store.getSnapshot(), store.settings).catch(() => {}), 1500);
    };
    sync();
    const unsubscribe = store.subscribe(sync);
    // Opening the app tops up the week of medicine alerts and re-arms anything the
    // phone dropped (an app update, a battery saver clearing alarms).
    const onVisible = () => document.visibilityState === 'visible' && sync();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(t);
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [store]);

  if (error) {
    return (
      <div role="alert" className="grid min-h-dvh place-items-center bg-paper p-6 text-center">
        <div>
          <p className="text-lg font-semibold text-ink">We couldn’t load your ZarooriBox.</p>
          <p className="mt-1 text-muted">{error}</p>
          <button className="btn btn-primary mt-5" onClick={() => location.reload()}>Try again</button>
        </div>
      </div>
    );
  }
  if (!store) {
    return (
      <div className="grid min-h-dvh place-items-center bg-paper" aria-busy="true" aria-live="polite">
        <div className="flex flex-col items-center gap-3 text-muted">
          <span className="size-10 animate-pulse rounded-2xl bg-brand-600" />
          <span className="text-sm">Opening your ZarooriBox…</span>
        </div>
      </div>
    );
  }
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): ZarooriStore {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore must be used inside DataProvider');
  return s;
}

export function useData(): UserData {
  const s = useStore();
  return useSyncExternalStore(s.subscribe, s.getSnapshot);
}

/** Joined, display-ready views of memories and lendings. */
export function useViews() {
  const data = useData();
  return useMemo(() => ({ data, memories: buildMemoryViews(data), lendings: buildLendingViews(data) }), [data]);
}
