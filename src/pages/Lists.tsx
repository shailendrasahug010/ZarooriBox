import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { PageHeader } from '../components/ui';
import { active, expiringSoon } from '../lib/selectors';
import { useViews } from '../store/DataProvider';

export default function Lists() {
  const { data, memories, lendings } = useViews();
  const tiles = [
    { to: '/app/shopping', emoji: '🛒', title: 'Shopping', meta: `${data.shopping.filter((s) => !s.purchased).length} to buy` },
    { to: '/app/people', emoji: '👥', title: 'People & Things', meta: `${lendings.filter((l) => l.status === 'open').length} open` },
    { to: '/app/expiry', emoji: '⏰', title: 'Expiry Radar', meta: `${expiringSoon(memories).length} expiring` },
    { to: '/app/home-maintenance', emoji: '🏠', title: 'Home Maintenance', meta: `${active(memories).filter((m) => m.categoryId === 'home').length} tasks` },
    { to: '/app/calendar', emoji: '📅', title: 'Calendar', meta: 'Month view' },
    { to: '/app/upcoming', emoji: '🗂️', title: 'All memories', meta: `${active(memories).length} active` },
    { to: '/app/search', emoji: '🔍', title: 'Search', meta: 'Find anything' },
  ];
  return (
    <div>
      <PageHeader title="Lists" subtitle="Everything in your Zaroori, by kind." />
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map((t, i) => (
          <li key={t.to} className="animate-fade-up" style={{ animationDelay: `${i * 30}ms` }}>
            <Link to={t.to} className="card flex h-full flex-col gap-3 p-4 transition hover:-translate-y-0.5 hover:shadow-lift">
              <span className="text-3xl" aria-hidden="true">
                {t.emoji}
              </span>
              <span>
                <span className="flex items-center justify-between font-bold">
                  {t.title}
                  <ChevronRight className="size-4 text-muted" aria-hidden="true" />
                </span>
                <span className="text-sm text-muted">{t.meta}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
