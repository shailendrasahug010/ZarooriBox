import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Lending } from '../types';
import type { LendingInput } from '../store/memoryInput';
import { MemoryDetail } from './MemoryDetail';
import { LendingFormModal } from './LendingForm';

interface UIApi {
  openMemory: (id: string) => void;
  openLendingForm: (opts?: { lending?: Lending; preset?: Partial<LendingInput> }) => void;
}

const UIContext = createContext<UIApi | null>(null);

/** Hosts app-wide sheets (memory details, lending form) so any screen can open them. */
export function UIProvider({ children }: { children: ReactNode }) {
  const [memoryId, setMemoryId] = useState<string | null>(null);
  const [lendingForm, setLendingForm] = useState<{ lending?: Lending; preset?: Partial<LendingInput> } | null>(null);

  const openMemory = useCallback((id: string) => setMemoryId(id), []);
  const openLendingForm = useCallback<UIApi['openLendingForm']>((opts = {}) => setLendingForm(opts), []);
  const api = useMemo(() => ({ openMemory, openLendingForm }), [openMemory, openLendingForm]);

  return (
    <UIContext.Provider value={api}>
      {children}
      <MemoryDetail id={memoryId} onClose={() => setMemoryId(null)} />
      <LendingFormModal state={lendingForm} onClose={() => setLendingForm(null)} />
    </UIContext.Provider>
  );
}

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used inside UIProvider');
  return ctx;
}
