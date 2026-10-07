import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cx } from './ui';

/**
 * Accessible dialog: bottom sheet on phones, centred card on larger screens.
 * Traps focus, closes on Escape / backdrop, and restores focus on close.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const el = panel.current;
    const focusables = () =>
      Array.from(el?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])') ?? []);
    (el?.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0] ?? el)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      }
      if (e.key === 'Tab') {
        const f = focusables();
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-fade-in" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx(
          'relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[1.75rem] bg-surface shadow-lift outline-none animate-sheet-up sm:rounded-[1.5rem] sm:animate-scale-in',
          size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg',
        )}
      >
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-line-strong sm:hidden" aria-hidden="true" />
        <header className="flex items-center justify-between gap-3 px-5 pb-2 pt-3 sm:px-6 sm:pt-5">
          <h2 id={titleId} className="text-lg font-bold tracking-tight">
            {title}
          </h2>
          <button type="button" className="icon-btn -mr-2" onClick={onClose} aria-label="Close">
            <X className="size-5" />
          </button>
        </header>
        <div className="overflow-y-auto px-5 pb-5 sm:px-6">{children}</div>
        {footer && <footer className="border-t border-line px-5 py-3.5 pb-[calc(0.875rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-3.5">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
  danger,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className={cx('btn', danger ? 'btn-danger' : 'btn-primary')} onClick={onConfirm} data-autofocus>
            {confirmLabel}
          </button>
        </div>
      }
    >
      <div className="text-ink-soft">{body}</div>
    </Modal>
  );
}
