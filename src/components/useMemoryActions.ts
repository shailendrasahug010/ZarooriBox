import { useCallback } from 'react';
import type { MemoryStatus } from '../types';
import { useStore } from '../store/DataProvider';
import { formatDate } from '../lib/dates';
import { useToast } from './Toast';

/** Complete / archive / delete with friendly toasts and one-tap Undo. */
export function useMemoryActions() {
  const store = useStore();
  const toast = useToast();

  const fail = useCallback((e: unknown) => toast.error(e instanceof Error ? e.message : 'Something went wrong.'), [toast]);

  const complete = useCallback(
    async (id: string) => {
      const snap = store.snapshot(id);
      if (!snap) return;
      try {
        const r = await store.completeMemory(id);
        const undo = { label: 'Undo', onClick: () => store.restore(snap).catch(fail) };
        if (r.kind === 'rolled') toast.success(`Done! Next one is on ${formatDate(r.nextDue)}`, undo);
        else toast.success(`Nice, “${snap.memory.title}” is done 🎉`, undo);
      } catch (e) {
        fail(e);
      }
    },
    [store, toast, fail],
  );

  const setStatus = useCallback(
    async (id: string, status: MemoryStatus) => {
      const snap = store.snapshot(id);
      if (!snap) return;
      try {
        await store.setStatus(id, status);
        const msg = status === 'archived' ? 'Archived' : status === 'active' ? 'Moved back to active' : 'Marked as done';
        toast.success(msg, { label: 'Undo', onClick: () => store.restore(snap).catch(fail) });
      } catch (e) {
        fail(e);
      }
    },
    [store, toast, fail],
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        const snap = await store.deleteMemory(id);
        if (snap) toast.success(`Deleted “${snap.memory.title}”`, { label: 'Undo', onClick: () => store.restore(snap).catch(fail) });
      } catch (e) {
        fail(e);
      }
    },
    [store, toast, fail],
  );

  return { complete, setStatus, remove };
}
