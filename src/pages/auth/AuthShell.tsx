import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

const REMINDERS = [
  { emoji: '🚗', title: 'Car insurance', meta: 'Expires in 34 days', tone: 'bg-soon-bg text-soon' },
  { emoji: '👥', title: 'Rahul owes me ₹2,000', meta: 'Follow up tomorrow', tone: 'bg-brand-50 text-brand-700' },
  { emoji: '🏠', title: 'RO filter change', meta: 'Every 6 months', tone: 'bg-ok-bg text-ok' },
  { emoji: '⚡', title: 'Electricity bill', meta: 'Due today', tone: 'bg-attn-bg text-attn' },
  { emoji: '🎂', title: 'Maa’s birthday', meta: 'In 5 days', tone: 'bg-soon-bg text-soon' },
  { emoji: '🛂', title: 'Passport renewal', meta: 'Expires March 2027', tone: 'bg-brand-50 text-brand-700' },
];

const FEATURES = [
  { emoji: '🎙️', title: 'Just say it', body: 'Add by voice in Hindi, English and 10 more Indian languages.' },
  { emoji: '📷', title: 'Snap a document', body: 'LifeBox reads the expiry or due date for you.' },
  { emoji: '👨‍👩‍👧', title: 'Share with family', body: 'One list for the house, reminders for everyone.' },
  { emoji: '🔔', title: 'Never miss it', body: 'Alerts on your phone, in email and on WhatsApp.' },
];

const WORDS = ['bills', 'renewals', 'birthdays', 'warranties', 'services', 'things you lent'];

/** The LifeBox logo: the box bobs gently while a few sparks fly out of it. */
export function AnimatedLogo({ size = 'size-12', light = false }: { size?: string; light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-3">
      <span className={`relative ${size} shrink-0 ${light ? 'rounded-2xl bg-white p-0.5 shadow-lift' : ''}`}>
        <img src="/logo-mark.png" alt="" className="size-full object-contain animate-float [animation-duration:3.5s]" draggable={false} />
        {[
          { l: '22%', sx: '-12px', sy: '-16px', d: '0s', c: 'bg-amber-300' },
          { l: '50%', sx: '2px', sy: '-22px', d: '0.35s', c: 'bg-pink-400' },
          { l: '76%', sx: '13px', sy: '-15px', d: '0.7s', c: 'bg-sky-300' },
        ].map((p) => (
          <span
            key={p.l}
            className={`absolute top-0 size-1.5 rounded-full opacity-0 animate-sparkle ${p.c}`}
            style={{ left: p.l, animationDelay: p.d, '--sx': p.sx, '--sy': p.sy } as CSSProperties}
          />
        ))}
      </span>
      <span className={`text-[1.4rem] font-extrabold tracking-tight ${light ? 'text-white' : 'text-ink'}`}>
        Life<span className={light ? 'text-sky-200' : 'text-blue-600'}>Box</span>
      </span>
    </span>
  );
}

/** "Never miss your bills / renewals / …", one word at a time. */
function RotatingLine({ className = '' }: { className?: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % WORDS.length), 2200);
    return () => clearInterval(t);
  }, []);
  return (
    <p className={className}>
      Never miss your{' '}
      <span className="relative inline-block">
        <span key={i} className="inline-block animate-word-in font-bold text-amber-200">
          {WORDS[i]}
        </span>
        <svg viewBox="0 0 100 8" preserveAspectRatio="none" className="absolute -bottom-1.5 left-0 h-2 w-full text-amber-200/80" aria-hidden="true">
          <path key={i} d="M2 5 Q 50 1 98 5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" pathLength={1} strokeDasharray="1" className="animate-draw" />
        </svg>
      </span>
      .
    </p>
  );
}

function ReminderCard({ r, className = '', style }: { r: (typeof REMINDERS)[number]; className?: string; style?: CSSProperties }) {
  return (
    <div className={`flex items-center gap-3 rounded-2xl bg-white p-3 text-ink shadow-lift ${className}`} style={style}>
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-paper text-xl">{r.emoji}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{r.title}</span>
        <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${r.tone}`}>{r.meta}</span>
      </span>
    </div>
  );
}

function Blobs() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <span className="absolute -right-20 -top-24 size-80 rounded-full bg-brand-500/40 blur-3xl animate-drift" />
      <span className="absolute -bottom-28 -left-16 size-96 rounded-full bg-emerald-300/20 blur-3xl animate-drift" style={{ animationDelay: '-6s' }} />
      <span className="absolute left-1/3 top-1/3 size-56 rounded-full bg-amber-200/10 blur-3xl animate-drift" style={{ animationDelay: '-12s' }} />
      <svg className="absolute inset-0 size-full opacity-[0.07]" aria-hidden="true">
        <defs>
          <pattern id="auth-dots" width="22" height="22" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.4" fill="#fff" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#auth-dots)" />
      </svg>
    </div>
  );
}

const PLATFORMS = ['🌐 Web', '🤖 Android', '🍎 iPhone'];

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-paper lg:grid-cols-[1.1fr_1fr]">
      {/* Phone: a short animated band above the form. */}
      <header className="relative overflow-hidden rounded-b-[2rem] bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 pb-6 pt-[calc(env(safe-area-inset-top)+1.25rem)] text-white lg:hidden">
        <Blobs />
        <div className="relative px-5">
          <Link to="/" aria-label="LifeBox home" className="inline-flex rounded-xl animate-fade-up">
            <AnimatedLogo light size="size-12" />
          </Link>
          <p className="mt-4 text-[1.6rem] font-extrabold leading-tight tracking-tight animate-fade-up" style={{ animationDelay: '80ms' }}>
            Everything you don’t want to forget.
          </p>
          <RotatingLine className="mt-1.5 text-[1.02rem] text-brand-100 animate-fade-up" />
        </div>
        <div className="relative mt-5 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]" aria-hidden="true">
          <div className="flex w-max gap-3 animate-marquee hover:[animation-play-state:paused]">
            {[...REMINDERS, ...REMINDERS].map((r, i) => (
              <ReminderCard key={i} r={r} className="w-60 shrink-0 py-2.5" />
            ))}
          </div>
        </div>
      </header>

      {/* Computer: the full story beside the form. */}
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 px-12 py-10 text-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
        <Blobs />
        <Link to="/" aria-label="LifeBox home" className="relative inline-flex self-start rounded-xl animate-fade-up">
          <AnimatedLogo light />
        </Link>
        <div className="relative mt-10 max-w-lg">
          <p className="text-[2.6rem] font-extrabold leading-[1.1] tracking-tight animate-fade-up" style={{ animationDelay: '80ms' }}>
            Everything you don’t want to forget.
          </p>
          <RotatingLine className="mt-3 text-xl text-brand-100 animate-fade-up" />
          <p className="mt-3 text-brand-100/90 animate-fade-up" style={{ animationDelay: '160ms' }}>
            Capture it once. Forget about it. Get reminded at the right time.
          </p>
        </div>

        <div className="relative mt-8 [@media(max-height:720px)]:hidden" aria-hidden="true">
          <div className="space-y-3">
            {REMINDERS.slice(0, 3).map((r, i) => (
              <div key={r.title} className={`animate-fade-up ${i === 2 ? '[@media(max-height:900px)]:hidden' : ''}`} style={{ marginLeft: `${i * 2}rem`, animationDelay: `${250 + i * 140}ms` }}>
                <ReminderCard r={r} className="max-w-xs animate-float" style={{ animationDelay: `${-i * 2}s` }} />
              </div>
            ))}
          </div>
        </div>

        <ul className="relative mt-auto grid grid-cols-2 gap-3 pt-6">
          {FEATURES.map((f, i) => (
            <li
              key={f.title}
              className="rounded-2xl bg-white/10 p-3.5 ring-1 ring-white/15 backdrop-blur-sm transition hover:-translate-y-0.5 hover:bg-white/15 animate-fade-up"
              style={{ animationDelay: `${500 + i * 90}ms` }}
            >
              <span className="text-xl" aria-hidden="true">{f.emoji}</span>
              <p className="mt-1 font-bold">{f.title}</p>
              <p className="text-sm text-brand-100 [@media(max-height:820px)]:hidden">{f.body}</p>
            </li>
          ))}
        </ul>
        <p className="relative mt-5 flex flex-wrap items-center gap-2 text-sm text-brand-100 animate-fade-up" style={{ animationDelay: '900ms' }}>
          One account on
          {PLATFORMS.map((p) => (
            <span key={p} className="rounded-full bg-white/10 px-2.5 py-1 font-semibold text-white ring-1 ring-white/15">
              {p}
            </span>
          ))}
        </p>
      </aside>

      <main className="relative flex flex-col px-5 pb-8 pt-7 sm:px-10 lg:py-10">
        <div className="m-auto w-full max-w-sm">
          <img
            src="/logo.png"
            alt="LifeBox: Everything you don’t want to forget."
            width={567}
            height={600}
            className="mx-auto mb-6 h-auto w-44 animate-pop drop-shadow-[0_12px_24px_rgb(29_111_242/0.18)] sm:w-48"
            draggable={false}
          />
          <div className="animate-fade-up" style={{ animationDelay: '120ms' }}>
            <h1 className="text-[1.75rem] font-extrabold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-1.5 text-muted">{subtitle}</p>}
          </div>
          <div className="mt-7 animate-fade-up" style={{ animationDelay: '200ms' }}>
            {children}
          </div>
          {footer && (
            <div className="mt-6 text-center text-sm text-muted animate-fade-up" style={{ animationDelay: '280ms' }}>
              {footer}
            </div>
          )}
          {/* Phone: what LifeBox does, below the form. */}
          <ul className="mt-9 grid grid-cols-2 gap-2.5 lg:hidden">
            {FEATURES.map((f, i) => (
              <li key={f.title} className="rounded-2xl bg-surface p-3 shadow-card animate-fade-up" style={{ animationDelay: `${360 + i * 80}ms` }}>
                <span className="text-lg" aria-hidden="true">{f.emoji}</span>
                <p className="mt-0.5 text-sm font-bold">{f.title}</p>
                <p className="text-xs leading-snug text-muted">{f.body}</p>
              </li>
            ))}
          </ul>
          <p className="mt-5 flex flex-wrap items-center justify-center gap-1.5 text-xs text-muted lg:hidden">
            One account on
            {PLATFORMS.map((p) => (
              <span key={p} className="rounded-full bg-surface px-2 py-0.5 font-semibold text-ink-soft shadow-card">
                {p}
              </span>
            ))}
          </p>
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
