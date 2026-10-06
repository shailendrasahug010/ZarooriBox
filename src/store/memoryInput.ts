import type { CategoryId, ID, ISODate, LendingDirection, LendingKind, MemoryStatus, RepeatSpec } from '../types';
import { isValidISO } from '../lib/dates';

export type ReminderChoice =
  | { mode: 'none' }
  | { mode: 'offset'; offsetDays: number }
  | { mode: 'date'; date: ISODate };

export interface MemoryInput {
  title: string;
  description?: string;
  categoryId: CategoryId;
  subcategory?: string;
  dueDate?: ISODate | null;
  reminder: ReminderChoice;
  repeat: RepeatSpec;
  status: MemoryStatus;
  amount?: number | null;
  personName?: string;
  location?: string;
  notes?: string;
  newFiles?: File[];
  removeAttachmentIds?: ID[];
  source?: 'manual' | 'quick_add';
}

export interface LendingInput {
  personName: string;
  direction: LendingDirection;
  kind: LendingKind;
  amount?: number | null;
  itemName?: string;
  date: ISODate;
  followUpDate?: ISODate | null;
  notes?: string;
}

export type FieldErrors = Partial<Record<string, string>>;

const MAX_TEXT = 2000;

export function validateMemory(input: MemoryInput): FieldErrors {
  const e: FieldErrors = {};
  const title = input.title.trim();
  if (!title) e.title = 'Give it a name, like “Car insurance”.';
  else if (title.length > 120) e.title = 'Keep the title under 120 characters.';
  if (input.dueDate && !isValidISO(input.dueDate)) e.dueDate = 'Pick a valid date.';
  if (input.reminder.mode === 'date') {
    if (!isValidISO(input.reminder.date)) e.reminder = 'Pick a valid reminder date.';
    else if (input.dueDate && input.reminder.date > input.dueDate) e.reminder = 'The reminder should be on or before the due date.';
  }
  if (input.reminder.mode === 'offset' && !input.dueDate) e.reminder = 'Add a due date so we know when to remind you.';
  if (input.repeat.frequency !== 'never') {
    if (!input.dueDate) e.repeat = 'Repeating items need a first due date.';
    if (!Number.isInteger(input.repeat.interval) || input.repeat.interval < 1 || input.repeat.interval > 999) {
      e.repeat = 'Use a whole number between 1 and 999.';
    }
  }
  if (input.amount != null && (Number.isNaN(input.amount) || input.amount < 0 || input.amount > 1e12)) {
    e.amount = 'Enter a positive amount.';
  }
  for (const k of ['description', 'notes', 'location', 'personName'] as const) {
    if ((input[k]?.length ?? 0) > MAX_TEXT) e[k] = 'That’s a bit long. Please shorten it.';
  }
  return e;
}

export function validateLending(input: LendingInput): FieldErrors {
  const e: FieldErrors = {};
  if (!input.personName.trim()) e.personName = 'Who is it with?';
  else if (input.personName.length > 60) e.personName = 'Keep the name under 60 characters.';
  if (input.kind === 'money') {
    if (input.amount == null || Number.isNaN(input.amount) || input.amount <= 0) e.amount = 'Enter how much.';
  } else if (!input.itemName?.trim()) e.itemName = 'What was it?';
  if (!isValidISO(input.date)) e.date = 'Pick a valid date.';
  if (input.followUpDate && !isValidISO(input.followUpDate)) e.followUpDate = 'Pick a valid date.';
  if (input.followUpDate && isValidISO(input.date) && input.followUpDate < input.date) e.followUpDate = 'Follow-up should be after the date.';
  if ((input.notes?.length ?? 0) > MAX_TEXT) e.notes = 'That’s a bit long. Please shorten it.';
  return e;
}

export const hasErrors = (e: FieldErrors) => Object.values(e).some(Boolean);
