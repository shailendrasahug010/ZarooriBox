import { MemoryRow } from '../components/MemoryRow';
import { EmptyState, PageHeader } from '../components/ui';
import { byDue } from '../lib/selectors';
import { useViews } from '../store/DataProvider';

export default function Favourites() {
  const { memories } = useViews();
  const starred = memories.filter((m) => m.favorite && m.status !== 'archived');
  const open = starred.filter((m) => m.status === 'active').sort(byDue);
  const done = starred.filter((m) => m.status !== 'active');

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Favourites" subtitle="The things you starred, all in one place." />
      {starred.length === 0 ? (
        <div className="card">
          <EmptyState emoji="⭐" title="No favourites yet" body="Open any item and tap the star to keep it here." />
        </div>
      ) : (
        <section className="card animate-fade-up p-4 sm:p-5" aria-label="Favourites">
          <ul className="-mx-2">
            {[...open, ...done].map((m) => (
              <MemoryRow key={m.id} m={m} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
