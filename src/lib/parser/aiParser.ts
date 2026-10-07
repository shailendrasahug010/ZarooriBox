import type { CategoryId, RepeatFrequency, RepeatUnit } from '../../types';
import { ruleParser } from './ruleParser';
import type { ParseContext, ParsedQuickAdd, ParsedShoppingItem, QuickAddParser } from './types';

// AI Quick Add. The model runs on the server (supabase/functions/parse-quick-add),
// never in the browser, so the API key stays secret. Whatever comes back is treated
// as untrusted: every field is checked here, and anything missing or malformed is
// filled from the rule parser. Any failure (offline, timeout, rate limit) quietly
// falls back to rules, so Quick Add always works.

export type AiTransport = (body: { text: string; today: string; currency: string }) => Promise<unknown>;

const CATEGORIES: CategoryId[] = ['personal', 'home', 'finance', 'shopping', 'people', 'vehicle', 'documents', 'health', 'bookings'];
const FREQUENCIES: RepeatFrequency[] = ['never', 'daily', 'weekly', 'monthly', 'quarterly', 'half_yearly', 'yearly', 'custom'];
const UNITS: RepeatUnit[] = ['day', 'week', 'month', 'year'];
const LISTS = ['Grocery', 'Home', 'Personal care', 'Wishlist', 'Other'];

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const str = (x: unknown, max = 120) => (typeof x === 'string' && x.trim() ? x.trim().slice(0, max) : null);
const oneOf = <T extends string>(x: unknown, allowed: readonly T[]) => (allowed.includes(x as T) ? (x as T) : null);

function isoDate(x: unknown): string | null {
  if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return null;
  const d = new Date(`${x}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === x ? x : null;
}

function int(x: unknown, min: number, max: number): number | null {
  return typeof x === 'number' && Number.isInteger(x) && x >= min && x <= max ? x : null;
}

/**
 * Merges a model response onto the rule parser's result, keeping only fields that
 * pass validation. Returns null when the response is unusable as a whole.
 */
export function normalizeParsed(data: unknown, fallback: ParsedQuickAdd): ParsedQuickAdd | null {
  if (!isObj(data) || data.fallback === true) return null;
  const kind = oneOf(data.kind, ['memory', 'lending', 'shopping'] as const);
  const title = str(data.title);
  const categoryId = oneOf(data.categoryId, CATEGORIES);
  if (!kind || !title || !categoryId) return null;

  const out: ParsedQuickAdd = { ...fallback, kind, title, categoryId, confidence: 'high', source: 'ai' };
  out.subcategory = str(data.subcategory, 40) ?? undefined;
  // Medicines and bookings are newer than the AI's category list: keep the rules' pick for them.
  if (kind === 'memory' && (fallback.categoryId === 'health' || fallback.categoryId === 'bookings') && categoryId !== fallback.categoryId) {
    out.categoryId = fallback.categoryId;
    out.subcategory = fallback.subcategory;
  }
  if ('dueDate' in data) out.dueDate = isoDate(data.dueDate);
  if ('reminderDaysBefore' in data) out.reminderDaysBefore = int(data.reminderDaysBefore, 0, 365);
  if ('amount' in data) out.amount = typeof data.amount === 'number' && Number.isFinite(data.amount) && data.amount >= 0 && data.amount < 1e12 ? data.amount : null;
  if ('person' in data) out.person = str(data.person, 60);
  if (typeof data.isExpiry === 'boolean') out.isExpiry = data.isExpiry;

  if (isObj(data.repeat)) {
    const frequency = oneOf(data.repeat.frequency, FREQUENCIES);
    const interval = int(data.repeat.interval, 1, 120);
    const unit = oneOf(data.repeat.unit, UNITS);
    if (frequency && interval && unit) out.repeat = { frequency, interval, unit };
  }

  if (kind === 'lending') {
    const direction = oneOf(data.direction, ['lent', 'borrowed'] as const) ?? fallback.direction;
    const lendingKind = oneOf(data.lendingKind, ['money', 'thing'] as const) ?? fallback.lendingKind;
    if (!direction || !lendingKind || !out.person) return null;
    out.direction = direction;
    out.lendingKind = lendingKind;
    out.thing = str(data.thing, 80) ?? undefined;
    out.followUpDate = isoDate(data.followUpDate);
    if (lendingKind === 'money' && out.amount == null) return null;
    if (lendingKind === 'thing' && !out.thing) return null;
  }

  if (kind === 'shopping') {
    const items: ParsedShoppingItem[] = [];
    if (Array.isArray(data.shoppingItems)) {
      for (const it of data.shoppingItems.slice(0, 30)) {
        if (!isObj(it)) continue;
        const name = str(it.name, 60);
        if (!name) continue;
        items.push({ name, quantity: str(it.quantity, 30) ?? undefined, listCategory: oneOf(it.listCategory, LISTS) ?? 'Grocery' });
      }
    }
    if (!items.length) return null;
    out.shoppingItems = items;
  }

  return { ...out, raw: fallback.raw };
}

export function createAiParser(transport: AiTransport, timeoutMs = 6000): QuickAddParser {
  return {
    name: 'ai',
    async parse(text: string, ctx: ParseContext) {
      const fallback = await ruleParser.parse(text, ctx);
      try {
        const data = await Promise.race([
          transport({ text, today: ctx.today, currency: ctx.currency }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('AI parser timed out')), timeoutMs)),
        ]);
        return normalizeParsed(data, fallback) ?? fallback;
      } catch {
        return fallback;
      }
    },
  };
}

/** Calls a plain HTTP endpoint (VITE_AI_PARSER_URL), for self-hosted setups. */
export function httpTransport(endpoint: string): AiTransport {
  return async (body) => {
    const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`AI parser returned ${res.status}`);
    return res.json();
  };
}
