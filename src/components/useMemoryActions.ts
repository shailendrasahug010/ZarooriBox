import { useCallback } from 'react';
import type { MemoryStatus } from '../types';
import { useStore } from '../store/DataProvider';
import { formatDate } from '../lib/dates';
import { useToast } from './Toast';
import { useT } from '../i18n';

/** Complete / archive / delete with friendly toasts and one-tap Undo. */
export function useMemoryActions() {
  const store = useStore();
  const toast = useToast();
  const t = useT();

  const fail = useCallback((e: unknown) => toast.error(e instanceof Error ? e.message : 'Something went wrong.'), [toast]);

  const complete = useCallback(
    async (id: string) => {
      const snap = store.snapshot(id);
      if (!snap) return;
      try {
        const r = await store.completeMemory(id);
        const undo = { label: t('act.undo'), onClick: () => store.restore(snap).catch(fail) };
        if (r.kind === 'rolled') toast.success(t('act.rolledToast', { date: formatDate(r.nextDue) }), undo);
        else toast.success(t('act.doneToast', { title: snap.memory.title }), undo);
      } catch (e) {
        fail(e);
      }
    },
    [store, toast, fail, t],
  );

  /** Moves the reminder to tomorrow (or next week), with Undo. */
  const snooze = useCallback(
    async (id: string, days = 1) => {
      const snap = store.snapshot(id);
      if (!snap) return;
      try {
        await store.snoozeMemory(id, days);
        toast.success(days === 1 ? t('act.snoozedTomorrow') : t('act.snoozed', { when: t('act.week').toLowerCase() }), {
          label: t('act.undo'),
          onClick: () => store.restore(snap).catch(fail),
        });
      } catch (e) {
        fail(e);
      }
    },
    [store, toast, fail, t],
  );

  const setStatus = useCallback(
    async (id: string, status: MemoryStatus) => {
      const snap = store.snapshot(id);
      if (!snap) return;
      try {
        await store.setStatus(id, status);
        const msg = status === 'archived' ? t('act.archived') : status === 'active' ? t('act.reactivated') : t('act.markedDone');
        toast.success(msg, { label: t('act.undo'), onClick: () => store.restore(snap).catch(fail) });
      } catch (e) {
        fail(e);
      }
    },
    [store, toast, fail, t],
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        const snap = await store.deleteMemory(id);
        if (snap) toast.success(t('act.deleted', { title: snap.memory.title }), { label: t('act.undo'), onClick: () => store.restore(snap).catch(fail) });
      } catch (e) {
        fail(e);
      }
    },
    [store, toast, fail, t],
  );

  return { complete, snooze, setStatus, remove };
}
