import type { CollectionName, ID, UserData, UserSettings } from '../types';
import { COLLECTIONS } from '../data/repository';
import { uid } from './format';

// Backups: the "Export my data" file and the daily Google Drive copy share one
// format (camelCase rows per collection, as in UserData). Restoring puts those rows
// into the signed-in account, which may be a different account on a new phone.

export interface Backup {
  exportedAt?: string;
  user?: { name?: string; email?: string };
  settings?: Partial<UserSettings> | null;
  memories: UserData['memories'];
  reminders: UserData['reminders'];
  recurrences: UserData['recurrences'];
  people: UserData['people'];
  lendings: UserData['lendings'];
  shopping: UserData['shopping'];
  attachments: UserData['attachments'];
}

/** Collections a backup brings back. Old in-app notifications are left out. */
const RESTORED = COLLECTIONS.filter((c) => c !== 'notifications') as Exclude<CollectionName, 'notifications'>[];

const MAX_ROWS = 20_000;

/** Reads a backup file's text, or explains in plain words why it can't be used. */
export function parseBackup(text: string): Backup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('That file isn’t a ZarooriBox backup.');
  }
  const o = raw as Record<string, unknown>;
  if (!o || typeof o !== 'object' || !Array.isArray(o.memories)) throw new Error('That file isn’t a ZarooriBox backup.');
  let total = 0;
  const out: Record<string, unknown> = { exportedAt: typeof o.exportedAt === 'string' ? o.exportedAt : undefined, settings: o.settings ?? null };
  for (const c of RESTORED) {
    const rows = o[c] ?? [];
    if (!Array.isArray(rows) || rows.some((r) => !r || typeof r !== 'object' || typeof (r as { id?: unknown }).id !== 'string')) {
      throw new Error('That backup file is damaged.');
    }
    total += rows.length;
    out[c] = rows;
  }
  if (total > MAX_ROWS) throw new Error('That backup is too large to restore here.');
  return out as unknown as Backup;
}

/**
 * Gives every row a fresh id (keeping links between rows), makes the signed-in
 * person the owner, and keeps everything private. Fresh ids mean a restore can
 * never collide with rows that still exist elsewhere, e.g. in the old account.
 */
export function prepareRestore(backup: Backup, userId: ID): Omit<UserData, 'notifications' | 'settings' | 'family'> {
  const b = ownRowsOnly(backup);
  const ids = new Map<string, string>();
  for (const c of RESTORED) {
    for (const r of b[c] as { id: string }[]) {
      const prefix = r.id.includes('_') ? r.id.slice(0, r.id.indexOf('_')) : '';
      ids.set(r.id, uid(prefix));
    }
  }
  const remap = <T extends object>(row: T): T => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (k === 'userId') out[k] = userId;
      else if (k === 'householdId') out[k] = null;
      else if (k === 'dataUrl') continue;
      else if ((k === 'id' || k.endsWith('Id')) && typeof v === 'string') out[k] = ids.get(v) ?? v;
      else out[k] = v;
    }
    return out as T;
  };
  // Rows that point at something missing from the backup would be refused by the database.
  const memIds = new Set(b.memories.map((m) => m.id));
  const personIds = new Set(b.people.map((p) => p.id));
  return {
    people: b.people.map(remap),
    memories: b.memories.map((m) => remap(m.personId && !personIds.has(m.personId) ? { ...m, personId: null } : m)),
    reminders: b.reminders.filter((r) => memIds.has(r.memoryId)).map(remap),
    recurrences: b.recurrences.filter((r) => memIds.has(r.memoryId)).map(remap),
    lendings: b.lendings.filter((l) => personIds.has(l.personId)).map(remap),
    shopping: b.shopping.map(remap),
    // Files stay in the old account's storage; only bring back the ones this account can open.
    attachments: b.attachments.filter((a) => memIds.has(a.memoryId) && a.storagePath?.startsWith(`${userId}/`)).map(remap),
  };
}

/** Items a family member shared show up in an export too; they stay theirs, so leave them out. */
function ownRowsOnly(b: Backup): Backup {
  const owner = b.settings?.userId;
  if (!owner) return b;
  const mine = <T extends { userId?: ID }>(rows: T[]) => rows.filter((r) => !r.userId || r.userId === owner);
  return { ...b, memories: mine(b.memories), reminders: mine(b.reminders), recurrences: mine(b.recurrences), people: mine(b.people), lendings: mine(b.lendings), shopping: mine(b.shopping), attachments: mine(b.attachments) };
}

/** Settings worth carrying over to a new phone. Plan, phone number and timezone stay as they are. */
export function restoredSettings(b: Backup): Partial<UserSettings> {
  const s = b.settings ?? {};
  const out: Partial<UserSettings> = {};
  if (typeof s.currency === 'string') out.currency = s.currency;
  if (typeof s.defaultReminderDays === 'number') out.defaultReminderDays = s.defaultReminderDays;
  if (s.language === 'en' || s.language === 'hi') out.language = s.language;
  if (typeof s.voiceLanguage === 'string' || s.voiceLanguage === null) out.voiceLanguage = s.voiceLanguage;
  return out;
}

export function backupCount(b: Backup): number {
  return b.memories.length + b.lendings.length + b.shopping.length;
}
