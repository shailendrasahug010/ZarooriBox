import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useT, type MessageKey } from '../i18n';
import { Check } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { MemoryRow } from '../components/MemoryRow';
import { QuickAdd } from '../components/QuickAdd';
import { useToast } from '../components/Toast';
import { useUI } from '../components/UIProvider';
import { EmptyState, SectionCard, StatusDot, cx } from '../components/ui';
import { formatDate, formatLongToday, now, relativeLabel } from '../lib/dates';
import { formatMoney, plural } from '../lib/format';
import { active, comingSoon, dueToday, expiringSoon, overallStatus, recentlyAdded, sortByDue, type LendingView } from '../lib/selectors';
import { useStore, useViews } from '../store/DataProvider';

const STATUS_COPY = {
  attention: { emoji: '🔴', text: 'dash.status.attention', cls: 'bg-attn-bg text-attn' },
  soon: { emoji: '🟡', text: 'dash.status.soon', cls: 'bg-soon-bg text-soon' },
  ok: { emoji: '🟢', text: 'dash.status.ok', cls: 'bg-ok-bg text-ok' },
} as const;

function greetingKey(): MessageKey {
  const h = now().getHours();
  if (h >= 5 && h < 12) return 'greet.morning';
  if (h >= 12 && h < 17) return 'greet.afternoon';
  return 'greet.evening';
}

const HINT_KEY = 'lifebox:v1:swipe-hint-seen';

export function lendingTitle(l: LendingView) {
  const who = l.person?.name ?? 'Someone';
  if (l.kind === 'money') {
    const amt = formatMoney(l.amount, l.currency);
    return l.direction === 'lent' ? `${who} owes me ${amt}` : `I owe ${who} ${amt}`;
  }
  const raw = l.itemName ?? 'something';
  // "Drill machine" reads naturally lowercased; "Harry Potter books" keeps its capitals.
  const item = /[A-Z]/.test(raw.slice(1)) ? raw : raw.toLowerCase();
  return l.direction === 'lent' ? `${who} has my ${item}` : `I borrowed ${item.startsWith('a ') ? item : `a ${item}`} from ${who}`;
}

export default function Dashboard() {
  const { user } = useAuth();
  const { data, memories, lendings } = useViews();
  const store = useStore();
  const toast = useToast();
  const { openLendingForm } = useUI();
  const t = useT();
  // Home-screen shortcuts: "Quick add" opens /app?add=1, "Add by voice" /app?voice=1.
  const [params] = useSearchParams();

  const today = dueToday(memories);
  const soon = comingSoon(memories).slice(0, 5);
  const expiring = expiringSoon(memories, 90).filter((m) => (m.daysLeft ?? 0) > 0).slice(0, 4);
  const recent = recentlyAdded(memories, 4);
  const shopping = data.shopping.filter((s) => !s.purchased);
  const openLendings = lendings.filter((l) => l.status === 'open').sort((a, b) => (a.followUpDate ?? '').localeCompare(b.followUpDate ?? ''));
  const home = sortByDue(active(memories).filter((m) => m.categoryId === 'home')).slice(0, 4);
  const status = overallStatus(memories, lendings);
  const s = STATUS_COPY[status];
  const firstName = user?.name.split(' ')[0] ?? '';
  const settings = data.settings ?? store.settings;
  let showHint = false;
  try {
    showHint = (today.length > 0 || soon.length > 0) && !localStorage.getItem(HINT_KEY);
  } catch {
    /* no storage */
  }

  // A brand-new, empty account starts with the short setup.
  const empty = !data.memories.length && !data.lendings.length && !data.shopping.length;
  if (empty && !settings.onboardedAt && !user?.isDemo) return <Navigate to="/app/welcome" replace />;

  return (
    <div className="space-y-5">
      <header className="animate-fade-up">
        <p className="text-sm font-medium text-muted">{formatLongToday()}</p>
        <h1 className="mt-1 text-[1.75rem] font-extrabold leading-tight tracking-tight sm:text-[2.1rem]">
          {t(greetingKey())}
          {firstName ? `, ${firstName}` : ''} <span aria-hidden="true">👋</span>
        </h1>
        <p className="mt-1 text-[1.05rem] text-ink-soft">{t('dash.attentionLine')}</p>
        <p className={cx('mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold', s.cls)} role="status">
          <span aria-hidden="true">{s.emoji}</span>
          {t(s.text)}
          {today.length > 0 && <span className="font-medium opacity-80">· {t.lang === 'en' ? `${plural(today.length, 'item')} due` : t('dash.itemsDue', { n: today.length })}</span>}
        </p>
      </header>

      <div className="animate-fade-up" style={{ animationDelay: '60ms' }}>
        <QuickAdd autoFocus={params.get('add') === '1'} autoVoice={params.get('voice') === '1'} />
      </div>
      {showHint && (
        <p className="flex items-center justify-between gap-3 rounded-2xl bg-brand-50 px-4 py-2.5 text-sm text-brand-800 lg:hidden">
          {t('dash.swipeHint')}
          <button
            type="button"
            className="shrink-0 font-semibold"
            onClick={(e) => {
              try {
                localStorage.setItem(HINT_KEY, '1');
              } catch {
                /* ignore */
              }
              (e.currentTarget.parentElement as HTMLElement).hidden = true;
            }}
          >
            OK
          </button>
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title={t('dash.dueToday')} emoji="🔴" count={today.length} to="/app/upcoming" delay={100}>
          {today.length ? (
            <ul className="-mx-2">
              {today.map((m) => (
                <MemoryRow key={m.id} m={m} />
              ))}
            </ul>
          ) : (
            <EmptyState emoji="🎉" title={t('dash.empty.today.title')} body={t('dash.empty.today.body')} />
          )}
        </SectionCard>

        <SectionCard title={t('dash.comingSoon')} emoji="🟡" count={comingSoon(memories).length} to="/app/upcoming" delay={140}>
          {soon.length ? (
            <ul className="-mx-2">
              {soon.map((m) => (
                <MemoryRow key={m.id} m={m} />
              ))}
            </ul>
          ) : (
            <EmptyState emoji="🌤️" title={t('dash.empty.soon.title')} body={t('dash.empty.soon.body')} />
          )}
        </SectionCard>

        <SectionCard title={t('dash.expiringSoon')} emoji="⏰" to="/app/expiry" linkLabel={t('dash.radar')} delay={180}>
          {expiring.length ? (
            <ul className="grid grid-cols-2 gap-2.5">
              {expiring.map((m) => (
                <ExpiryTile key={m.id} id={m.id} title={m.title} days={m.daysLeft ?? 0} urgency={m.urgency} />
              ))}
            </ul>
          ) : (
            <EmptyState emoji="🛡️" title={t('dash.empty.expiry.title')} body={t('dash.empty.expiry.body')} />
          )}
        </SectionCard>

        <SectionCard title={t('dash.shopping')} emoji="🛒" count={shopping.length} to="/app/shopping" linkLabel={t('dash.openList')} delay={220}>
          {shopping.length ? (
            <ul className="-mx-1 grid grid-cols-1 gap-0.5 sm:grid-cols-2">
              {shopping.slice(0, 6).map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => store.toggleShopping(item.id).then(() => toast.success(t('dash.got', { name: item.name }), { label: t('act.undo'), onClick: () => void store.toggleShopping(item.id) }))}
                    className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2 text-left hover:bg-paper"
                    aria-label={`Mark ${item.name} as purchased`}
                  >
                    <span className="grid size-5 place-items-center rounded-md border-2 border-line-strong" aria-hidden="true">
                      <Check className="size-3.5 text-transparent" />
                    </span>
                    <span className="flex-1 truncate font-medium">{item.name}</span>
                    {item.quantity && <span className="text-sm text-muted">{item.quantity}</span>}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState emoji="🧺" title={t('dash.empty.shopping.title')} body={t('dash.empty.shopping.body')} />
          )}
        </SectionCard>

        <SectionCard title={t('dash.people')} emoji="👥" count={openLendings.length} to="/app/people" delay={260}>
          {openLendings.length ? (
            <ul className="-mx-1 space-y-0.5">
              {openLendings.slice(0, 4).map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => openLendingForm({ lending: l })}
                    className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 text-left hover:bg-paper"
                  >
                    <span
                      className={cx('grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold', l.direction === 'lent' ? 'bg-brand-50 text-brand-700' : 'bg-soon-bg text-soon')}
                      aria-hidden="true"
                    >
                      {(l.person?.name ?? '?').slice(0, 1)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{lendingTitle(l)}</span>
                      <span className="block text-[0.83rem] text-muted">
                        {l.followUpDate ? `Follow up ${relativeLabel(l.followUpDate).toLowerCase()}` : `Since ${formatDate(l.date)}`}
                      </span>
                    </span>
                    <StatusDot urgency={l.urgency} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState emoji="🤝" title={t('dash.empty.people.title')} body={t('dash.empty.people.body')} />
          )}
        </SectionCard>

        <SectionCard title={t('dash.home')} emoji="🏠" count={home.length} to="/app/home-maintenance" delay={300}>
          {home.length ? (
            <ul className="-mx-2">
              {home.map((m) => (
                <MemoryRow key={m.id} m={m} />
              ))}
            </ul>
          ) : (
            <EmptyState emoji="🏡" title={t('dash.empty.home.title')} body={t('dash.empty.home.body')} />
          )}
        </SectionCard>

        <SectionCard title={t('dash.recent')} emoji="🕘" className="lg:col-span-2" delay={340}>
          {recent.length ? (
            <ul className="-mx-2 grid grid-cols-1 lg:grid-cols-2 lg:gap-x-4">
              {recent.map((m) => (
                <MemoryRow key={m.id} m={m} showCheck={false} />
              ))}
            </ul>
          ) : (
            <EmptyState
              emoji="📦"
              title={t('dash.empty.recent.title')}
              body={t('dash.empty.recent.body')}
              action={
                <Link to="/app/add" className="btn btn-primary">
                  {t('dash.empty.recent.action')}
                </Link>
              }
            />
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function ExpiryTile({ id, title, days, urgency }: { id: string; title: string; days: number; urgency: string }) {
  const { openMemory } = useUI();
  return (
    <li>
      <button
        type="button"
        onClick={() => openMemory(id)}
        className="flex h-full w-full flex-col rounded-2xl bg-paper p-3 text-left transition hover:bg-line/50"
      >
        <span className="truncate text-sm font-semibold text-ink">{title}</span>
        <span className={cx('mt-1 text-xl font-extrabold tracking-tight', urgency === 'attention' ? 'text-attn' : urgency === 'soon' ? 'text-soon' : 'text-ok')}>
          {days} <span className="text-sm font-semibold">day{days === 1 ? '' : 's'}</span>
        </span>
        <span className="text-xs text-muted">left</span>
      </button>
    </li>
  );
}
