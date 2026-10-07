import type { ShoppingItem } from '../types';
import { getCategory } from './categories';
import type { LendingView, MemoryView } from './selectors';

export interface SearchResults {
  memories: MemoryView[];
  lendings: LendingView[];
  shopping: ShoppingItem[];
  total: number;
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

function score(title: string, hay: string, tokens: string[]): number {
  const t = norm(title);
  if (!tokens.every((tok) => hay.includes(tok))) return 0;
  let s = 1;
  if (t.startsWith(tokens[0])) s += 4;
  if (tokens.every((tok) => t.includes(tok))) s += 3;
  return s;
}

function rank<T>(rows: T[], title: (r: T) => string, hay: (r: T) => string, tokens: string[]): T[] {
  return rows
    .map((r) => ({ r, s: score(title(r), norm(hay(r)), tokens) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.r);
}

/** Searches every Zaroori record. All words must match somewhere in the record. */
export function searchAll(query: string, memories: MemoryView[], lendings: LendingView[], shopping: ShoppingItem[]): SearchResults {
  const tokens = norm(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return { memories: [], lendings: [], shopping: [], total: 0 };
  const m = rank(
    memories,
    (x) => x.title,
    (x) =>
      [x.title, x.description, x.notes, x.location, getCategory(x.categoryId).name, x.subcategory, x.person?.name, x.amount, x.status === 'active' ? '' : x.status, ...x.attachments.map((f) => f.name)]
        .filter(Boolean)
        .join(' '),
    tokens,
  );
  const l = rank(
    lendings,
    (x) => `${x.person?.name ?? ''} ${x.itemName ?? ''}`,
    (x) =>
      [x.person?.name, x.itemName, x.notes, x.amount, x.direction === 'lent' ? 'lent owes money people' : 'borrowed owe people', x.kind]
        .filter(Boolean)
        .join(' '),
    tokens,
  );
  const s = rank(shopping, (x) => x.name, (x) => `${x.name} ${x.listCategory} ${x.quantity ?? ''} shopping`, tokens);
  return { memories: m, lendings: l, shopping: s, total: m.length + l.length + s.length };
}
