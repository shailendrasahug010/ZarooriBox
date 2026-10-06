import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import type { CategoryId } from '../types';
import { getCategory } from '../lib/categories';
import { relativeLabel } from '../lib/dates';
import type { Urgency } from '../lib/selectors';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

export function Logo({ className = '', withText = true }: { className?: string; withText?: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-2.5', className)}>
      <svg viewBox="0 0 64 64" className="size-8 shrink-0" aria-hidden="true">
        <rect x="4" y="4" width="56" height="56" rx="17" fill="#17745D" />
        <path d="M18 27h28v18a5 5 0 0 1-5 5H23a5 5 0 0 1-5-5V27z" fill="#fff" />
        <path d="M15 21a4 4 0 0 1 4-4h26a4 4 0 0 1 4 4v6H15v-6z" fill="#BFE6D8" />
        <circle cx="32" cy="37" r="4" fill="#17745D" />
      </svg>
      {withText && <span className="text-[1.15rem] font-extrabold tracking-tight text-ink">LifeBox</span>}
    </span>
  );
}

export function CategoryTile({ categoryId, size = 'md' }: { categoryId: CategoryId; size?: 'sm' | 'md' | 'lg' }) {
  const c = getCategory(categoryId);
  const s = size === 'sm' ? 'size-8 text-base rounded-lg' : size === 'lg' ? 'size-12 text-2xl rounded-2xl' : 'size-10 text-lg rounded-xl';
  return (
    <span className={cx('grid shrink-0 place-items-center', s, c.tint)} aria-hidden="true">
      {c.emoji}
    </span>
  );
}

const URGENCY_STYLE: Record<Exclude<Urgency, 'none'>, { pill: string; dot: string; label: string }> = {
  attention: { pill: 'bg-attn-bg text-attn', dot: 'bg-attn-dot', label: 'Needs attention' },
  soon: { pill: 'bg-soon-bg text-soon', dot: 'bg-soon-dot', label: 'Coming soon' },
  ok: { pill: 'bg-ok-bg text-ok', dot: 'bg-ok-dot', label: 'All good' },
};

export function StatusDot({ urgency, className = '' }: { urgency: Urgency; className?: string }) {
  if (urgency === 'none') return null;
  return <span className={cx('inline-block size-2 shrink-0 rounded-full', URGENCY_STYLE[urgency].dot, className)} aria-hidden="true" />;
}

/** "Today", "in 5 days", "Overdue · 2 days" with a soft urgency colour. */
export function DuePill({ date, urgency, prefix }: { date: string; urgency: Urgency; prefix?: string }) {
  const label = relativeLabel(date);
  const overdue = label.endsWith('ago');
  const style = urgency === 'none' ? 'bg-ink/5 text-muted' : URGENCY_STYLE[urgency].pill;
  return (
    <span className={cx('inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold', style)}>
      {urgency !== 'none' && <StatusDot urgency={urgency} />}
      {prefix}
      {overdue ? `Overdue · ${label.replace(' ago', '')}` : label}
    </span>
  );
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="label">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="mt-1.5 text-sm font-medium text-attn">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="mt-1.5 text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function EmptyState({ emoji, title, body, action }: { emoji: string; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center animate-fade-in">
      <span className="mb-3 grid size-14 place-items-center rounded-2xl bg-paper text-3xl" aria-hidden="true">
        {emoji}
      </span>
      <p className="font-semibold text-ink">{title}</p>
      {body && <p className="mt-1 max-w-xs text-sm text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function SectionCard({
  title,
  emoji,
  count,
  to,
  linkLabel = 'See all',
  children,
  className,
  delay = 0,
}: {
  title: string;
  emoji?: string;
  count?: number;
  to?: string;
  linkLabel?: string;
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const headingId = `sec-${title.toLowerCase().replace(/\W+/g, '-')}`;
  return (
    <section aria-labelledby={headingId} className={cx('card min-w-0 animate-fade-up p-4 sm:p-5', className)} style={{ animationDelay: `${delay}ms` }}>
      <header className="mb-2 flex items-center justify-between gap-2">
        <h2 id={headingId} className="section-title">
          {emoji && <span aria-hidden="true">{emoji}</span>}
          {title}
          {count != null && count > 0 && <span className="rounded-full bg-ink/5 px-2 py-0.5 text-xs font-semibold text-muted">{count}</span>}
        </h2>
        {to && (
          <Link to={to} className="-mr-2 inline-flex min-h-9 items-center gap-0.5 rounded-lg px-2 text-sm font-semibold text-brand-700 hover:bg-brand-50">
            {linkLabel}
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex rounded-xl bg-ink/[0.05] p-1">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'min-h-9 rounded-lg px-3.5 text-sm font-semibold transition',
            value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
          {o.count != null && <span className="ml-1.5 text-xs opacity-60">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3 animate-fade-in">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}
