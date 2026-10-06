import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { CircleCheck, Info, AlertCircle, X } from 'lucide-react';
import { cx } from './ui';

type Tone = 'success' | 'info' | 'error';
interface Toast {
  id: number;
  message: string;
  tone: Tone;
  action?: { label: string; onClick: () => void };
}

interface ToastApi {
  show: (message: string, opts?: { tone?: Tone; action?: Toast['action']; duration?: number }) => void;
  success: (message: string, action?: Toast['action']) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const show = useCallback<ToastApi['show']>(
    (message, opts = {}) => {
      const id = next.current++;
      setToasts((t) => [...t.slice(-2), { id, message, tone: opts.tone ?? 'success', action: opts.action }]);
      window.setTimeout(() => dismiss(id), opts.duration ?? (opts.action ? 6000 : 3500));
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (m, action) => show(m, { tone: 'success', action }),
      error: (m) => show(m, { tone: 'error', duration: 5000 }),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6"
      >
        {toasts.map((t) => {
          const Icon = t.tone === 'error' ? AlertCircle : t.tone === 'info' ? Info : CircleCheck;
          return (
            <div
              key={t.id}
              role={t.tone === 'error' ? 'alert' : 'status'}
              className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-sm text-white shadow-lift animate-toast-in"
            >
              <Icon className={cx('size-5 shrink-0', t.tone === 'error' ? 'text-attn-dot' : 'text-brand-300')} aria-hidden="true" />
              <span className="flex-1 font-medium">{t.message}</span>
              {t.action && (
                <button
                  type="button"
                  className="rounded-lg px-2.5 py-1.5 font-semibold text-brand-200 hover:bg-white/10"
                  onClick={() => {
                    t.action!.onClick();
                    dismiss(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              )}
              <button type="button" aria-label="Dismiss" className="rounded-lg p-1 text-white/60 hover:text-white" onClick={() => dismiss(t.id)}>
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
