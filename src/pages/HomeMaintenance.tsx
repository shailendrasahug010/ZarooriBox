import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { MemoryRow } from '../components/MemoryRow';
import { EmptyState, PageHeader } from '../components/ui';
import { getCategory } from '../lib/categories';
import { sortByDue } from '../lib/selectors';
import { useViews } from '../store/DataProvider';

const SUB_EMOJI: Record<string, string> = { Maintenance: '🧰', Services: '🧑‍🔧', Bills: '🧾', Repairs: '🔨', Appliances: '🔌', General: '🏠' };

export default function HomeMaintenance() {
  const { memories } = useViews();
  const home = sortByDue(memories.filter((m) => m.categoryId === 'home' && m.status === 'active'));
  const subs = [...getCategory('home').subcategories, 'General']
    .map((s) => ({ name: s, items: home.filter((m) => (m.subcategory || 'General') === s) }))
    .filter((g) => g.items.length);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Home Maintenance"
        subtitle="Services, filters, bills and repairs that keep your home running."
        action={
          <Link to="/app/add?category=home" className="btn btn-primary btn-sm">
            <Plus className="size-4" aria-hidden="true" /> Add home task
          </Link>
        }
      />
      {subs.length === 0 ? (
        <div className="card">
          <EmptyState emoji="🏡" title="Your home is all set" body="Try “AC service every 6 months” or “Water tank cleaning every 3 months”." />
        </div>
      ) : (
        <div className="space-y-4">
          {subs.map((g) => (
            <section key={g.name} className="card animate-fade-up p-4 sm:p-5" aria-label={g.name}>
              <h2 className="section-title mb-1">
                <span aria-hidden="true">{SUB_EMOJI[g.name] ?? '🏠'}</span> {g.name}
              </h2>
              <ul className="-mx-2">
                {g.items.map((m) => (
                  <MemoryRow key={m.id} m={m} compact />
                ))}
              </ul>
            </section>
          ))}
          <p className="px-1 text-sm text-muted">Tip: when you tick off a repeating task, LifeBox moves it to the next date automatically.</p>
        </div>
      )}
    </div>
  );
}
