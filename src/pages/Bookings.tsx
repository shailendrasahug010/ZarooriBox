import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { MemoryRow } from '../components/MemoryRow';
import { EmptyState, PageHeader } from '../components/ui';
import { todayISO } from '../lib/dates';
import type { MemoryView } from '../lib/selectors';
import { useViews } from '../store/DataProvider';

const byWhen = (a: MemoryView, b: MemoryView) =>
  (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || (a.dueTimes?.[0] ?? '').localeCompare(b.dueTimes?.[0] ?? '');

export default function Bookings() {
  const { memories } = useViews();
  const today = todayISO();
  const all = memories.filter((m) => m.categoryId === 'bookings' && m.status !== 'archived');
  const upcoming = all.filter((m) => m.status === 'active' && (!m.dueDate || m.dueDate >= today)).sort(byWhen);
  const past = all.filter((m) => !upcoming.includes(m)).sort((a, b) => byWhen(b, a)).slice(0, 10);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Bookings"
        subtitle="Tickets, travel, hotels, tables and events, with the date and time."
        action={
          <Link to="/app/add?category=bookings" className="btn btn-primary btn-sm">
            <Plus className="size-4" aria-hidden="true" /> Add booking
          </Link>
        }
      />
      {all.length === 0 ? (
        <div className="card">
          <EmptyState emoji="🎟️" title="No bookings yet" body="Try “Train to Pune 12 Nov at 6:30am” or “Movie tickets Saturday 7pm”." />
        </div>
      ) : (
        <div className="space-y-4">
          <section className="card animate-fade-up p-4 sm:p-5" aria-label="Upcoming">
            <h2 className="section-title mb-1">
              <span aria-hidden="true">🗓️</span> Upcoming
            </h2>
            {upcoming.length ? (
              <ul className="-mx-2">
                {upcoming.map((m) => (
                  <MemoryRow key={m.id} m={m} compact />
                ))}
              </ul>
            ) : (
              <p className="py-3 text-sm text-muted">Nothing coming up.</p>
            )}
          </section>
          {past.length > 0 && (
            <section className="card animate-fade-up p-4 sm:p-5" aria-label="Past">
              <h2 className="section-title mb-1">
                <span aria-hidden="true">🕘</span> Past
              </h2>
              <ul className="-mx-2">
                {past.map((m) => (
                  <MemoryRow key={m.id} m={m} compact />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
