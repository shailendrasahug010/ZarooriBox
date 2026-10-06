import type { CategoryId, ISODate, LendingDirection, LendingKind, RepeatSpec } from '../../types';

export type ParsedKind = 'memory' | 'lending' | 'shopping';

export interface ParsedShoppingItem {
  name: string;
  quantity?: string;
  listCategory: string;
}

export interface ParsedQuickAdd {
  kind: ParsedKind;
  raw: string;
  title: string;
  categoryId: CategoryId;
  subcategory?: string;
  dueDate: ISODate | null;
  reminderDaysBefore: number | null;
  repeat: RepeatSpec;
  amount: number | null;
  person: string | null;
  isExpiry: boolean;
  // Lending
  direction?: LendingDirection;
  lendingKind?: LendingKind;
  thing?: string;
  followUpDate?: ISODate | null;
  // Shopping
  shoppingItems?: ParsedShoppingItem[];
  confidence: 'high' | 'medium' | 'low';
  /** Set to 'ai' when the AI parser produced this result. */
  source?: 'ai' | 'rules';
}

export interface ParseContext {
  /** Reference "today" as YYYY-MM-DD. */
  today: ISODate;
  currency: string;
}

/**
 * Any Quick Add engine. The rule-based parser is the default; an AI parser can
 * implement the same interface and fall back to rules on failure.
 */
export interface QuickAddParser {
  readonly name: string;
  parse(text: string, ctx: ParseContext): Promise<ParsedQuickAdd>;
}
