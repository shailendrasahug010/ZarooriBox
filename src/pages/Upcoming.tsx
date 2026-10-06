import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { CategoryId, MemoryStatus } from '../types';
import { MemoryRow } from '../components/MemoryRow';
import { EmptyState, PageHeader, Segmented } from '../components/ui';
import { MEMORY_CATEGORIES } from '../lib/categories';
import { BUCKET_ORDER, bucketFor, sortByDue, type UpcomingBucket } from '../lib/selectors';
import { useViews } from '../store/DataProvider';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';

const BUCKET_EMOJI: Record<UpcomingBucket, string> = {
  Overdue: '⏳',
  Today: '🔴',
  'This week': '🟡',
  'This month': '📆',
  Later: '🌱',
  'No date': '📝',
};

export default function Upcoming() {
  const { memories } = useViews();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState<MemoryStatus>('active');
  const category = (params.get('category') as CategoryId | null) ?? 'all';

  const counts = useMemo(
    () => ({
      active: memories.filter((m) => m.status === 'active').length,
      completed: memories.filter((m) => m.status === 'completed').length,
      archived: memories.filter((m) => m.status === 'archived').length,
    }),
    [memories],
  );

  const filtered = sortByDue(memories.filter((m) => m.status === status && (category === 'all' || m.categoryId === category)));
  const groups = BUCKET_ORDER.map((b) => ({ bucket: b, items: filtered.filter((m) => bucketFor(m) === b) })).filter((g) => g.items.length);

  const setCategory = (c: string) => {
    const next = new URLSearchParams(params);
    if (c === 'all') next.delete('category');
    else next.set('category', c);
    setParams(next, { replace: true });
  };

  return (
    <div>
      <PageHeader
        title="Upcoming"
        subtitle="Everything with a date, in the order it comes up."
        action={
          <Link to="/app/add" className="btn btn-primary btn-sm">
            <Plus className="size-4" aria-hidden="true" /> Add
          </Link>
        }
      />
      <div className="mb-4 flex flex-col gap-3">
        <Segmented
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'active', label: 'Active', count: counts.active },
            { value: 'completed', label: 'Done', count: counts.completed },
            { value: 'archived', label: 'Archived', count: counts.archived },
          ]}
        />
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="group" aria-label="Filter by category">
          <button type="button" className="chip shrink-0" aria-pressed={category === 'all'} onClick={() => setCategory('all')}>
            All
          </button>
          {MEMORY_CATEGORIES.map((c) => (
            <button type="button" key={c.id} className="chip shrink-0" aria-pressed={category === c.id} onClick={() => setCategory(c.id)}>
              <span aria-hidden="true">{c.emoji}</span> {c.name}
            </button>
          ))}
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="card">
          <EmptyState
            emoji={status === 'active' ? '🎉' : status === 'completed' ? '✅' : '🗄️'}
            title={status === 'active' ? 'No forgotten things here' : status === 'completed' ? 'Nothing completed yet' : 'Nothing archived'}
            body={status === 'active' ? 'Nothing matches this filter. Enjoy the calm.' : undefined}
          />
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g, i) => (
            <section key={g.bucket} className="card animate-fade-up p-4 sm:p-5" style={{ animationDelay: `${i * 40}ms` }} aria-label={g.bucket}>
              <h2 className="section-title mb-1">
                <span aria-hidden="true">{BUCKET_EMOJI[g.bucket]}</span> {g.bucket}
                <span className="rounded-full bg-ink/5 px-2 py-0.5 text-xs font-semibold text-muted">{g.items.length}</span>
              </h2>
              <ul className="-mx-2">
                {g.items.map((m) => (
                  <MemoryRow key={m.id} m={m} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
