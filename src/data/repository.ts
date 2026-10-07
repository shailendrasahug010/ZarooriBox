import type { Attachment, CollectionName, CollectionRecord, Family, ID, ISODate, UserData, UserSettings } from '../types';

/**
 * Storage port. The app talks only to this interface, so localStorage and
 * Supabase/PostgreSQL are interchangeable. Every implementation is scoped to a
 * single signed-in user and must refuse to read or write anyone else's rows.
 */
export interface Repository {
  readonly mode: 'local' | 'supabase';
  readonly userId: ID;
  load(): Promise<UserData>;
  insert<K extends CollectionName>(collection: K, rows: CollectionRecord<K>[]): Promise<void>;
  update<K extends CollectionName>(collection: K, id: ID, patch: Partial<CollectionRecord<K>>): Promise<void>;
  remove<K extends CollectionName>(collection: K, ids: ID[]): Promise<void>;
  saveSettings(settings: UserSettings): Promise<void>;
  /** Stores the file bytes and returns the attachment with dataUrl or storagePath filled. */
  storeFile(file: File, attachment: Attachment): Promise<Attachment>;
  /** Removes everything this user owns (used for "reset demo data" and account deletion). */
  clearAll(): Promise<void>;
  /** Family sharing. Only cloud accounts have it, because it needs a server. */
  readonly family?: FamilyService;
  /** Medicine doses marked "Taken". Cloud accounts keep them; local mode uses this device. */
  readonly doses?: DoseLogService;
}

export interface DoseLogService {
  /** Keys ("<memoryId>@<HH:mm>") of the doses taken on that day. */
  taken(day: ISODate): Promise<string[]>;
  set(day: ISODate, key: string, taken: boolean): Promise<void>;
}

export interface FamilyService {
  load(): Promise<Family | null>;
  create(name: string, displayName: string): Promise<void>;
  join(code: string, displayName: string): Promise<void>;
  leave(): Promise<void>;
}

export const EMPTY_DATA: UserData = {
  memories: [],
  reminders: [],
  recurrences: [],
  people: [],
  lendings: [],
  shopping: [],
  notifications: [],
  attachments: [],
  settings: null,
  family: null,
};

export const COLLECTIONS: CollectionName[] = [
  'memories',
  'reminders',
  'recurrences',
  'people',
  'lendings',
  'shopping',
  'notifications',
  'attachments',
];

export class AccessDeniedError extends Error {
  constructor() {
    super('You do not have access to this record.');
    this.name = 'AccessDeniedError';
  }
}
