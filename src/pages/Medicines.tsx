import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { DoseList } from '../components/DoseList';
import { MemoryRow } from '../components/MemoryRow';
import { EmptyState, PageHeader } from '../components/ui';
import { todayISO } from '../lib/dates';
import { dosesOn, isMedicine } from '../lib/medicines';
import { sortByDue } from '../lib/selectors';
import { useViews } from '../store/DataProvider';

export default function Medicines() {
  const { memories, data } = useViews();
  const health = memories.filter((m) => m.categoryId === 'health' && m.status === 'active');
  const meds = health.filter(isMedicine).sort((a, b) => a.title.localeCompare(b.title));
  const visits = sortByDue(health.filter((m) => !isMedicine(m)));
  const hasDoses = dosesOn(data.memories, data.recurrences, todayISO()).length > 0;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Medicines"
        subtitle="Doses with a time for each, plus doctor visits, tests and vaccines."
        action={
          <Link to="/app/add?category=health&type=Medicines" className="btn btn-primary btn-sm">
            <Plus className="size-4" aria-hidden="true" /> Add medicine
          </Link>
        }
      />
      {meds.length === 0 && visits.length === 0 ? (
        <div className="card">
          <EmptyState emoji="💊" title="No medicines yet" body="Add one with its dose times, like “Vitamin D at 9am” or “BP tablet twice a day”. We’ll alert you at each time." />
        </div>
      ) : (
        <div className="space-y-4">
          {hasDoses && (
            <section className="card animate-fade-up p-4 sm:p-5" aria-label="Today">
              <h2 className="section-title mb-2">
                <span aria-hidden="true">⏰</span> Today
              </h2>
              <DoseList />
              <p className="mt-2 px-2 text-xs text-muted">Ticks are saved on this device.</p>
            </section>
          )}
          {meds.length > 0 && (
            <section className="card animate-fade-up p-4 sm:p-5" aria-label="My medicines">
              <h2 className="section-title mb-1">
                <span aria-hidden="true">💊</span> My medicines
              </h2>
              <ul className="-mx-2">
                {meds.map((m) => (
                  <MemoryRow key={m.id} m={m} compact />
                ))}
              </ul>
            </section>
          )}
          {visits.length > 0 && (
            <section className="card animate-fade-up p-4 sm:p-5" aria-label="Doctor visits and tests">
              <h2 className="section-title mb-1">
                <span aria-hidden="true">🩺</span> Doctor visits & tests
              </h2>
              <ul className="-mx-2">
                {visits.map((m) => (
                  <MemoryRow key={m.id} m={m} compact />
                ))}
              </ul>
            </section>
          )}
          <Link to="/app/add?category=health&type=Doctor%20visits" className="btn btn-secondary btn-sm">
            <Plus className="size-4" aria-hidden="true" /> Add doctor visit or test
          </Link>
        </div>
      )}
    </div>
  );
}
