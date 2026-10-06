import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { createRepository } from '../data';
import { deviceChannel } from '../lib/notifications/channels';
import { isNativeApp, syncNativeSchedule } from '../lib/notifications/native';
import { buildLendingViews, buildMemoryViews } from '../lib/selectors';
import type { UserData } from '../types';
import { LifeBoxStore } from './LifeBoxStore';

const StoreContext = createContext<LifeBoxStore | null>(null);

const CHECK_EVERY_MS = 60_000;

export function DataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [store, setStore] = useState<LifeBoxStore | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const s = new LifeBoxStore(createRepository(user.id), user);
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
          await deviceChannel.send({ title: fired[0].title, body: fired[0].body, tag: `lifebox-${fired[0].dueDate}`, url: '/app' });
        } else {
          await deviceChannel.send({ title: `LifeBox: ${fired.length} things need you`, body: fired.slice(0, 3).map((f) => f.title).join(', '), tag: 'lifebox-digest', url: '/app' });
        }
      } catch {
        // A failed check retries on the next tick.
      }
    };
    check();
    const t = window.setInterval(check, CHECK_EVERY_MS);
    return () => window.clearInterval(t);
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
    return () => {
      window.clearTimeout(t);
      unsubscribe();
    };
  }, [store]);

  if (error) {
    return (
      <div role="alert" className="grid min-h-dvh place-items-center bg-paper p-6 text-center">
        <div>
          <p className="text-lg font-semibold text-ink">We couldn’t load your LifeBox.</p>
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
          <span className="text-sm">Opening your LifeBox…</span>
        </div>
      </div>
    );
  }
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): LifeBoxStore {
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
