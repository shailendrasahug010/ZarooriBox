import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useUI } from '../components/UIProvider';
import { CategoryTile, EmptyState, PageHeader, cx } from '../components/ui';
import { formatDate } from '../lib/dates';
import { active, sortByDue, type MemoryView } from '../lib/selectors';
import { useViews } from '../store/DataProvider';

const GROUPS: { title: string; hint: string; test: (d: number) => boolean; tone: 'attn' | 'soon' | 'ok' | 'muted' }[] = [
  { title: 'Act now', hint: 'Within a week', test: (d) => d <= 7, tone: 'attn' },
  { title: 'This month', hint: '8 to 31 days', test: (d) => d > 7 && d <= 31, tone: 'soon' },
  { title: 'Coming up', hint: '1 to 4 months', test: (d) => d > 31 && d <= 120, tone: 'ok' },
  { title: 'Further out', hint: 'More than 4 months', test: (d) => d > 120, tone: 'muted' },
];

const TONE = {
  attn: { bar: 'bg-attn-dot', text: 'text-attn' },
  soon: { bar: 'bg-soon-dot', text: 'text-soon' },
  ok: { bar: 'bg-ok-dot', text: 'text-ok' },
  muted: { bar: 'bg-line-strong', text: 'text-muted' },
};

function label(m: MemoryView) {
  const d = m.daysLeft ?? 0;
  const verb = /warrant|passport|licen|insurance|puc|registration|aadhaar|pan|certificate/i.test(`${m.title} ${m.subcategory}`) ? 'Expires' : 'Due';
  if (d < 0) return `${verb === 'Expires' ? 'Expired' : 'Overdue'} ${-d} day${d === -1 ? '' : 's'} ago`;
  if (d === 0) return `${verb} today`;
  return `${verb} in ${d} day${d === 1 ? '' : 's'}`;
}

function RadarCard({ m, tone }: { m: MemoryView; tone: keyof typeof TONE }) {
  const { openMemory } = useUI();
  const d = Math.max(0, m.daysLeft ?? 0);
  const pct = Math.max(6, Math.min(100, 100 - (d / 120) * 100));
  return (
    <li>
      <button type="button" onClick={() => openMemory(m.id)} className="card flex h-full w-full flex-col gap-3 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lift">
        <span className="flex items-center gap-3">
          <CategoryTile categoryId={m.categoryId} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{m.title}</span>
            <span className="block text-xs text-muted">{m.subcategory ?? 'Renewal'} · {formatDate(m.dueDate, { year: 'always' })}</span>
          </span>
        </span>
        <span className={cx('text-lg font-extrabold tracking-tight', TONE[tone].text)}>{label(m)}</span>
        <span className="h-1.5 w-full overflow-hidden rounded-full bg-paper" aria-hidden="true">
          <span className={cx('block h-full rounded-full transition-all', TONE[tone].bar)} style={{ width: `${pct}%` }} />
        </span>
      </button>
    </li>
  );
}

export default function ExpiryRadar() {
  const { memories } = useViews();
  const items = sortByDue(active(memories).filter((m) => m.isExpiry && m.dueDate));

  return (
    <div>
      <PageHeader
        title="Expiry Radar"
        subtitle="Passports, policies, PUC, warranties and subscriptions, before they lapse."
        action={
          <Link to="/app/add?category=documents" className="btn btn-primary btn-sm">
            <Plus className="size-4" aria-hidden="true" /> Track an expiry
          </Link>
        }
      />
      {items.length === 0 ? (
        <div className="card">
          <EmptyState emoji="🛡️" title="Nothing on the radar" body="Add a passport, insurance policy or warranty and we’ll watch the date for you." />
        </div>
      ) : (
        <div className="space-y-7">
          {GROUPS.map((g) => {
            const list = items.filter((m) => g.test(m.daysLeft ?? 0));
            if (!list.length) return null;
            return (
              <section key={g.title} aria-label={g.title} className="animate-fade-up">
                <h2 className="mb-3 flex items-baseline gap-2">
                  <span className="text-lg font-bold">{g.title}</span>
                  <span className="text-sm text-muted">{g.hint}</span>
                </h2>
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {list.map((m) => (
                    <RadarCard key={m.id} m={m} tone={g.tone} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
