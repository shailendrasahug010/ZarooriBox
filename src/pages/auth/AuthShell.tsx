import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '../../components/ui';

const FLOATING = [
  { emoji: '🚗', title: 'Car insurance', meta: 'Expires in 34 days', tone: 'bg-soon-bg text-soon' },
  { emoji: '👥', title: 'Rahul owes me ₹2,000', meta: 'Follow up tomorrow', tone: 'bg-brand-50 text-brand-700' },
  { emoji: '🏠', title: 'RO filter change', meta: 'Every 6 months', tone: 'bg-ok-bg text-ok' },
];

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-dvh pt-[env(safe-area-inset-top)] lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-brand-700 p-12 text-white lg:flex lg:flex-col" aria-hidden="true">
        <Link to="/" className="inline-flex rounded-xl">
          <span className="rounded-xl bg-white/95 px-3 py-2">
            <Logo />
          </span>
        </Link>
        <div className="mt-auto max-w-md">
          <p className="text-4xl font-extrabold leading-tight tracking-tight">Everything you don’t want to forget.</p>
          <p className="mt-3 text-lg text-brand-100">Capture it once. Forget about it. Get reminded at the right time.</p>
        </div>
        <div className="mt-10 space-y-3">
          {FLOATING.map((f, i) => (
            <div
              key={f.title}
              className="flex max-w-sm items-center gap-3 rounded-2xl bg-white p-3.5 text-ink shadow-lift animate-fade-up"
              style={{ marginLeft: `${i * 2.5}rem`, animationDelay: `${150 + i * 120}ms` }}
            >
              <span className="grid size-10 place-items-center rounded-xl bg-paper text-xl">{f.emoji}</span>
              <span className="flex-1">
                <span className="block font-semibold">{f.title}</span>
                <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${f.tone}`}>{f.meta}</span>
              </span>
            </div>
          ))}
        </div>
        <div className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-white/5" />
      </aside>
      <main className="flex flex-col px-5 py-8 sm:px-10">
        <Link to="/" className="mb-10 self-start lg:hidden" aria-label="LifeBox home">
          <Logo />
        </Link>
        <div className="m-auto w-full max-w-sm animate-fade-up">
          <h1 className="text-[1.75rem] font-extrabold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1.5 text-muted">{subtitle}</p>}
          <div className="mt-7">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

export function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
      <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8l3.7-2.8z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z" />
    </svg>
  );
}
