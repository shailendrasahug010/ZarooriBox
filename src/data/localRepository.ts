import type { Attachment, CollectionName, CollectionRecord, ID, UserData, UserSettings } from '../types';
import { AccessDeniedError, COLLECTIONS, EMPTY_DATA, type Repository } from './repository';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function memoryStore(): KeyValueStore {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

export const dataKey = (userId: ID) => `lifebox:v1:data:${userId}`;

/** Inline file limit in local mode, so localStorage (≈5 MB) doesn't fill up. */
export const LOCAL_FILE_LIMIT = 1_500_000;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/**
 * Browser-only database. Each user's rows live under their own key, and every
 * write checks the row's owner, mirroring the Supabase row-level security rules.
 */
export function createLocalRepository(userId: ID, store: KeyValueStore = localStorage): Repository {
  const key = dataKey(userId);

  const read = (): UserData => {
    try {
      const raw = store.getItem(key);
      if (!raw) return structuredClone(EMPTY_DATA);
      const parsed = JSON.parse(raw) as Partial<UserData>;
      const data = { ...structuredClone(EMPTY_DATA), ...parsed } as UserData;
      // Defensive: never surface a row that isn't this user's.
      for (const c of COLLECTIONS) {
        (data[c] as { userId: ID }[]) = (data[c] as { userId: ID }[]).filter((r) => r.userId === userId);
      }
      if (data.settings && data.settings.userId !== userId) data.settings = null;
      return data;
    } catch {
      return structuredClone(EMPTY_DATA);
    }
  };

  const write = (data: UserData) => {
    try {
      store.setItem(key, JSON.stringify(data));
    } catch (e) {
      throw new Error(
        e instanceof DOMException && e.name === 'QuotaExceededError'
          ? 'Your browser storage is full. Remove some attachments and try again.'
          : 'Could not save. Please try again.',
      );
    }
  };

  const assertOwner = (row: { userId?: ID }) => {
    if (row.userId !== userId) throw new AccessDeniedError();
  };

  return {
    mode: 'local',
    userId,
    async load() {
      return read();
    },
    async insert<K extends CollectionName>(collection: K, rows: CollectionRecord<K>[]) {
      rows.forEach(assertOwner);
      const data = read();
      (data[collection] as CollectionRecord<K>[]).push(...rows);
      write(data);
    },
    async update<K extends CollectionName>(collection: K, id: ID, patch: Partial<CollectionRecord<K>>) {
      if ('userId' in patch && patch.userId !== userId) throw new AccessDeniedError();
      const data = read();
      const list = data[collection] as CollectionRecord<K>[];
      const i = list.findIndex((r) => r.id === id);
      if (i === -1) throw new AccessDeniedError();
      list[i] = { ...list[i], ...patch, id, userId };
      write(data);
    },
    async remove<K extends CollectionName>(collection: K, ids: ID[]) {
      const data = read();
      const set = new Set(ids);
      (data[collection] as CollectionRecord<K>[]) = (data[collection] as CollectionRecord<K>[]).filter((r) => !set.has(r.id));
      write(data);
    },
    async saveSettings(settings: UserSettings) {
      assertOwner(settings);
      const data = read();
      data.settings = settings;
      write(data);
    },
    async storeFile(file: File, attachment: Attachment) {
      if (file.size > LOCAL_FILE_LIMIT) {
        throw new Error(`"${file.name}" is too large. Files up to 1.5 MB can be stored on this device.`);
      }
      return { ...attachment, dataUrl: await readFileAsDataUrl(file) };
    },
    async clearAll() {
      store.removeItem(key);
    },
  };
}
