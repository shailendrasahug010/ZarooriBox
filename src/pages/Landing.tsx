import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Lock, ShieldCheck, Sparkles, EyeOff, Download } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { Logo, cx } from '../components/ui';

const TYPED = ['Bike insurance expires on 17 November', 'I lent Rahul ₹2000 today', 'RO filter change every 6 months'];

function TypingQuickAdd() {
  const [i, setI] = useState(0);
  const [n, setN] = useState(0);
  useEffect(() => {
    const full = TYPED[i];
    const t = window.setTimeout(
      () => {
        if (n < full.length) setN(n + 1);
        else {
          setN(0);
          setI((i + 1) % TYPED.length);
        }
      },
      n < full.length ? 45 : 2200,
    );
    return () => window.clearTimeout(t);
  }, [i, n]);
  const done = n >= TYPED[i].length;
  const results = [
    [['Category', 'Vehicle · Insurance'], ['Date', '17 Nov'], ['Reminder', '30 days before']],
    [['Person', 'Rahul'], ['Amount', '₹2,000'], ['Follow up', 'in 7 days']],
    [['Category', 'Home · Maintenance'], ['Repeats', 'Every 6 months']],
  ][i];
  return (
    <div className="rounded-2xl border border-line bg-surface p-3 shadow-card">
      <div className="flex items-center gap-2">
        <span className="grid size-9 place-items-center rounded-xl bg-brand-50 text-brand-600">
          <Sparkles className="size-4" />
        </span>
        <span className="min-h-6 flex-1 truncate text-[0.95rem] font-medium">
          {TYPED[i].slice(0, n)}
          <span className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 animate-pulse bg-brand-600" />
        </span>
      </div>
      <div className={cx('mt-2 flex flex-wrap gap-1.5 transition-opacity duration-300', done ? 'opacity-100' : 'opacity-0')}>
        {results.map(([l, v]) => (
          <span key={l} className="rounded-lg bg-paper px-2 py-1 text-xs">
            <span className="text-muted">{l} </span>
            <span className="font-semibold">{v}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function DashboardPreview() {
  const row = (emoji: string, title: string, meta: string, pill: string, tone: string) => (
    <div className="flex items-center gap-3 rounded-xl px-2 py-2">
      <span className="grid size-8 place-items-center rounded-lg bg-paper text-base">{emoji}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{title}</span>
        <span className="block truncate text-xs text-muted">{meta}</span>
      </span>
      <span className={cx('rounded-full px-2 py-0.5 text-[0.7rem] font-semibold', tone)}>{pill}</span>
    </div>
  );
  return (
    <div className="relative mx-auto w-full max-w-md" aria-hidden="true">
      <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-brand-100/60 blur-2xl" />
      <div className="rounded-[2rem] border border-line bg-paper p-4 shadow-lift sm:p-5">
        <p className="text-xs font-medium text-muted">Tuesday, 6 October</p>
        <p className="text-xl font-extrabold tracking-tight">Good morning 👋</p>
        <p className="text-sm text-ink-soft">Here’s what needs your attention</p>
        <div className="mt-3">
          <TypingQuickAdd />
        </div>
        <div className="mt-3 rounded-2xl bg-surface p-3 shadow-card">
          <p className="mb-1 text-sm font-bold">🔴 Due Today</p>
          {row('🏠', 'Electricity bill', 'Bills · ₹1,840', 'Today', 'bg-attn-bg text-attn')}
          {row('✨', 'Return package', 'Pickup window closes tonight', 'Today', 'bg-attn-bg text-attn')}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-surface p-3 shadow-card">
            <p className="mb-1.5 text-sm font-bold">🟡 Coming soon</p>
            <p className="text-xs text-ink-soft">RO service · 5 days</p>
            <p className="text-xs text-ink-soft">Car service · 12 days</p>
            <p className="text-xs text-ink-soft">Prime renewal · 18 days</p>
          </div>
          <div className="rounded-2xl bg-surface p-3 shadow-card">
            <p className="mb-1.5 text-sm font-bold">🛒 Shopping</p>
            <p className="text-xs text-ink-soft">☐ Milk</p>
            <p className="text-xs text-ink-soft">☐ Detergent</p>
            <p className="text-xs text-ink-soft">☐ LED bulbs</p>
          </div>
        </div>
      </div>
    </div>
  );
}

const USE_CASES = [
  { emoji: '🔁', title: 'Never miss a renewal', body: 'Insurance, PUC, passport, subscriptions. Reminded weeks ahead, not the day after.' },
  { emoji: '🏠', title: 'Remember home maintenance', body: 'AC service, RO filters, pest control. Tick it off and the next date sets itself.' },
  { emoji: '🤝', title: 'Track things you lend', body: 'Money, books, that drill. Know who has what and nudge them kindly.' },
  { emoji: '🛒', title: 'Keep shopping lists', body: 'One list for groceries and home bits, made for a quick look in the shop.' },
  { emoji: '🎂', title: 'Remember important dates', body: 'Birthdays, anniversaries, appointments. With a heads-up before, not on the day.' },
  { emoji: '🧾', title: 'Track warranties', body: 'Keep the bill photo with the warranty date, ready when the fridge acts up.' },
];

export default function Landing() {
  const { user, signInDemo } = useAuth();
  const navigate = useNavigate();
  const startDemo = async () => {
    await signInDemo();
    navigate('/app');
  };

  return (
    <div className="min-h-dvh overflow-x-clip bg-paper">
      <a href="#content" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-ink focus:px-4 focus:py-2 focus:text-white">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-line/60 bg-paper/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <nav className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:px-6" aria-label="Main">
          <Link to="/" aria-label="LifeBox home">
            <Logo />
          </Link>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <a href="#how" className="btn btn-ghost btn-sm hidden sm:inline-flex">
              How it works
            </a>
            <a href="#privacy" className="btn btn-ghost btn-sm hidden sm:inline-flex">
              Privacy
            </a>
            {user ? (
              <Link to="/app" className="btn btn-primary btn-sm">
                Open LifeBox
              </Link>
            ) : (
              <>
                <Link to="/login" className="btn btn-ghost btn-sm">
                  Log in
                </Link>
                <Link to="/signup" className="btn btn-primary btn-sm">
                  Start Free
                </Link>
              </>
            )}
          </div>
        </nav>
      </header>

      <main id="content">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pb-24 lg:pt-20">
          <div className="animate-fade-up">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-700">
              <span aria-hidden="true">📦</span> Everything you don’t want to forget.
            </p>
            <h1 className="text-[2.6rem] font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
              Don’t remember everything.
              <span className="block text-brand-600">Let LifeBox remember it for you.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-ink-soft">
              Bills. Renewals. Home maintenance. Shopping. Things you lent. Important dates. Everything you don’t want to forget — in one simple place.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to={user ? '/app' : '/signup'} className="btn btn-primary h-13 px-6 text-base">
                Start Free <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <a href="#how" className="btn btn-secondary h-13 px-6 text-base">
                See How It Works
              </a>
            </div>
            <button type="button" onClick={startDemo} className="mt-4 text-sm font-semibold text-brand-700 underline-offset-4 hover:underline">
              Or peek inside the demo, no sign-up →
            </button>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
              {['Free forever for the basics', 'No ads', 'Works on any phone'].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <Check className="size-4 text-brand-600" aria-hidden="true" /> {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="animate-fade-up" style={{ animationDelay: '120ms' }}>
            <DashboardPreview />
          </div>
        </section>

        {/* Problem / solution */}
        <section className="border-y border-line/70 bg-surface">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-2 lg:py-20">
            <div>
              <p className="text-sm font-bold uppercase tracking-wider text-muted">The problem</p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">We remember hundreds of small things every day.</h2>
              <p className="mt-4 text-ink-soft">
                When the car insurance lapses. Who has your drill. Whether the RO filter was changed in March or May. It sits in your head, in old WhatsApp chats and on sticky notes, until
                the day it’s too late.
              </p>
            </div>
            <div>
              <p className="text-sm font-bold uppercase tracking-wider text-brand-600">The fix</p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">LifeBox keeps them in one place.</h2>
              <p className="mt-4 text-ink-soft">
                Type it like you’d say it. LifeBox figures out the date, the category and when to nudge you. Then it stays quiet until it matters. No projects, no boards, no productivity
                guilt.
              </p>
            </div>
          </div>
        </section>

        {/* Use cases */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
          <h2 className="max-w-2xl text-3xl font-extrabold tracking-tight sm:text-4xl">Made for the stuff real life is made of.</h2>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {USE_CASES.map((u) => (
              <li key={u.title} className="card p-6 transition hover:-translate-y-0.5 hover:shadow-lift">
                <span className="grid size-12 place-items-center rounded-2xl bg-paper text-2xl" aria-hidden="true">
                  {u.emoji}
                </span>
                <h3 className="mt-4 text-lg font-bold">{u.title}</h3>
                <p className="mt-1.5 text-ink-soft">{u.body}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-20 bg-brand-700 text-white">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
            <p className="text-sm font-bold uppercase tracking-wider text-brand-200">How it works</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">Capture → Forget → Get reminded.</h2>
            <ol className="mt-10 grid gap-5 md:grid-cols-3">
              {[
                { n: 1, t: 'Add something', b: '“Car insurance expires 12 Feb 2027.” One line, in your own words.' },
                { n: 2, t: 'Set when you need it', b: 'LifeBox suggests the date, category and a sensible reminder. Change anything you like.' },
                { n: 3, t: 'LifeBox reminds you', b: 'A calm nudge at the right time. Repeating things roll forward on their own.' },
              ].map((s) => (
                <li key={s.n} className="rounded-3xl bg-white/[0.07] p-6 ring-1 ring-white/10">
                  <span className="grid size-10 place-items-center rounded-full bg-white text-lg font-extrabold text-brand-700">{s.n}</span>
                  <h3 className="mt-4 text-xl font-bold">{s.t}</h3>
                  <p className="mt-1.5 text-brand-100">{s.b}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Privacy */}
        <section id="privacy" className="scroll-mt-20 mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-center">
            <div>
              <span className="grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-600">
                <ShieldCheck className="size-7" aria-hidden="true" />
              </span>
              <h2 className="mt-5 text-3xl font-extrabold tracking-tight sm:text-4xl">Your life is private. We keep it that way.</h2>
              <p className="mt-4 text-ink-soft">
                Passport dates, money you lent, your mother’s birthday. This is personal. LifeBox is built so only you can see your data, and we earn money from a simple optional plan, never
                from ads or selling information.
              </p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {[
                { icon: Lock, t: 'Only you can see it', b: 'Every record is tied to your account and locked by database rules.' },
                { icon: EyeOff, t: 'No ads, no selling', b: 'We will never sell or share your personal information.' },
                { icon: ShieldCheck, t: 'Secure by default', b: 'Encrypted connections and hashed passwords.' },
                { icon: Download, t: 'Yours to take', b: 'Export everything or delete your account any time.' },
              ].map(({ icon: Icon, t, b }) => (
                <li key={t} className="card p-5">
                  <Icon className="size-5 text-brand-600" aria-hidden="true" />
                  <h3 className="mt-3 font-bold">{t}</h3>
                  <p className="mt-1 text-sm text-ink-soft">{b}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* CTA */}
        <section className="px-4 pb-20 sm:px-6">
          <div className="mx-auto max-w-4xl rounded-[2rem] bg-ink px-6 py-14 text-center text-white sm:px-12">
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-5xl">Start remembering less.</h2>
            <p className="mx-auto mt-4 max-w-lg text-white/70">Set up in a minute. Your future self will thank you the next time a renewal comes around.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link to={user ? '/app' : '/signup'} className="btn btn-primary h-13 px-7 text-base">
                Start Free <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <button type="button" onClick={startDemo} className="btn h-13 bg-white/10 px-7 text-base text-white hover:bg-white/15">
                Try the demo
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:px-6">
          <Logo />
          <p>Everything you don’t want to forget. © {new Date().getFullYear()} LifeBox</p>
        </div>
      </footer>
    </div>
  );
}
