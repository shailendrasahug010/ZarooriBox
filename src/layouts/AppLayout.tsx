import { useEffect, useState, type ComponentType } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  CalendarClock,
  House,
  LayoutGrid,
  Plus,
  Radar,
  Search,
  Settings,
  ShoppingCart,
  User,
  Users,
  Wrench,
} from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { NotificationBell } from '../components/NotificationBell';
import { Logo, cx } from '../components/ui';
import { useData } from '../store/DataProvider';
import { EARLY_ACCESS } from '../lib/plans';

type Icon = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;

const NAV: { to: string; label: string; icon: Icon; end?: boolean }[] = [
  { to: '/app', label: 'Home', icon: House, end: true },
  { to: '/app/add', label: 'Add', icon: Plus },
  { to: '/app/upcoming', label: 'Upcoming', icon: CalendarClock },
  { to: '/app/expiry', label: 'Expiry Radar', icon: Radar },
  { to: '/app/shopping', label: 'Shopping', icon: ShoppingCart },
  { to: '/app/people', label: 'People & Things', icon: Users },
  { to: '/app/home-maintenance', label: 'Home Maintenance', icon: Wrench },
  { to: '/app/search', label: 'Search', icon: Search },
  { to: '/app/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/app/settings', label: 'Settings', icon: Settings },
];

const LIST_ROUTES = ['/app/lists', '/app/shopping', '/app/people', '/app/home-maintenance', '/app/expiry', '/app/calendar', '/app/search'];

function SidebarLink({ to, label, icon: Icon, end, badge }: { to: string; label: string; icon: Icon; end?: boolean; badge?: number }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cx(
          'group flex min-h-11 items-center gap-3 rounded-xl px-3 text-[0.94rem] font-semibold transition',
          isActive ? 'bg-surface text-ink shadow-card' : 'text-ink-soft hover:bg-ink/[0.04] hover:text-ink',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={cx('size-[1.15rem]', isActive ? 'text-brand-600' : 'text-muted group-hover:text-ink-soft')} aria-hidden />
          <span className="flex-1">{label}</span>
          {badge ? <span className="rounded-full bg-attn-bg px-2 py-0.5 text-xs font-bold text-attn">{badge}</span> : null}
        </>
      )}
    </NavLink>
  );
}

function BottomLink({ to, label, icon: Icon, active }: { to: string; label: string; icon: Icon; active: boolean }) {
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className={cx('flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[0.7rem] font-semibold transition', active ? 'text-brand-700' : 'text-muted')}
    >
      <Icon className={cx('size-[1.35rem] transition-transform', active && 'scale-110')} aria-hidden />
      {label}
    </Link>
  );
}

export function AppLayout() {
  const { user } = useAuth();
  const data = useData();
  const location = useLocation();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const path = location.pathname;
  const open = data.lendings.filter((l) => l.status === 'open').length;

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [path]);

  // Ctrl/Cmd+K or "/" jumps to search from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /input|textarea|select/i.test((e.target as HTMLElement)?.tagName ?? '');
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        navigate('/app/search');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  const initials = (user?.name ?? '?').slice(0, 1).toUpperCase();

  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only z-[70] rounded-lg bg-ink px-4 py-2 text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[16.5rem] flex-col border-r border-line/80 bg-paper px-4 py-5 lg:flex" aria-label="Main">
        <Link to="/app" className="mb-6 px-2" aria-label="LifeBox home">
          <Logo />
        </Link>
        <nav className="flex-1 space-y-0.5 overflow-y-auto">
          {NAV.map((n) => (
            <SidebarLink key={n.to} {...n} badge={n.to === '/app/people' ? open : undefined} />
          ))}
        </nav>
        <Link to="/app/settings" className="mt-4 flex items-center gap-3 rounded-2xl bg-surface p-3 shadow-card transition hover:shadow-lift">
          <span className="grid size-10 place-items-center rounded-full bg-brand-100 font-bold text-brand-800" aria-hidden="true">
            {initials}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-semibold">{user?.name}</span>
            <span className="block truncate text-xs text-muted">{EARLY_ACCESS ? 'Free · Early access' : 'Free plan'}</span>
          </span>
        </Link>
      </aside>

      <div className="lg:pl-[16.5rem]">
        {/* Top bar */}
        <header className="sticky top-0 z-20 border-b border-line/60 bg-paper/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-5xl items-center gap-2 px-4 sm:px-6">
            <Link to="/app" className="lg:hidden" aria-label="LifeBox home">
              <Logo />
            </Link>
            <form
              role="search"
              className="ml-auto hidden max-w-sm flex-1 lg:ml-0 lg:block"
              onSubmit={(e) => {
                e.preventDefault();
                navigate(`/app/search?q=${encodeURIComponent(q)}`);
              }}
            >
              <label className="relative block">
                <span className="sr-only">Search LifeBox</span>
                <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search everything…"
                  className="h-11 w-full rounded-xl border border-line bg-surface pl-10 pr-14 text-sm outline-none transition focus:border-brand-500 focus:shadow-focus"
                />
                <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-line px-1.5 text-[0.7rem] text-muted">Ctrl K</kbd>
              </label>
            </form>
            <div className="ml-auto flex items-center gap-1">
              <Link to="/app/search" className="icon-btn lg:hidden" aria-label="Search">
                <Search className="size-5" />
              </Link>
              <NotificationBell />
              <Link to="/app/add" className="btn btn-primary btn-sm ml-1 hidden lg:inline-flex">
                <Plus className="size-4" aria-hidden="true" /> New memory
              </Link>
            </div>
          </div>
        </header>

        <main id="main" className="mx-auto max-w-5xl px-4 pb-32 pt-5 sm:px-6 lg:pb-12 lg:pt-7" tabIndex={-1}>
          <div key={path} className="animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line/80 bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      >
        <div className="mx-auto flex max-w-lg items-end px-2">
          <BottomLink to="/app" label="Home" icon={House} active={path === '/app'} />
          <BottomLink to="/app/upcoming" label="Upcoming" icon={CalendarClock} active={path.startsWith('/app/upcoming')} />
          <div className="flex flex-1 justify-center">
            <Link
              to="/app/add"
              aria-label="Add a memory"
              aria-current={path === '/app/add' ? 'page' : undefined}
              className="-mt-6 grid size-[3.6rem] place-items-center rounded-[1.35rem] bg-brand-600 text-white shadow-[0_10px_24px_-8px_rgb(23_116_93/0.7)] ring-4 ring-paper transition active:scale-95"
            >
              <Plus className="size-7" strokeWidth={2.5} aria-hidden="true" />
            </Link>
          </div>
          <BottomLink to="/app/lists" label="Lists" icon={LayoutGrid} active={LIST_ROUTES.some((r) => path.startsWith(r))} />
          <BottomLink to="/app/settings" label="Profile" icon={User} active={path.startsWith('/app/settings')} />
        </div>
      </nav>
    </div>
  );
}
