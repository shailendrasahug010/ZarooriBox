import type { Attachment, CollectionName, CollectionRecord, ID, UserData, UserSettings } from '../types';
import { COLLECTIONS, EMPTY_DATA, type Repository } from './repository';
import { getSupabase } from './supabase';

// Supabase/PostgreSQL adapter. Tables and row-level security live in
// supabase/schema.sql; RLS guarantees a user can only touch rows where
// user_id = auth.uid(), even if this client code were tampered with.

const TABLES: Record<CollectionName, string> = {
  memories: 'memories',
  reminders: 'reminders',
  recurrences: 'recurring_items',
  people: 'people',
  lendings: 'lendings',
  shopping: 'shopping_items',
  notifications: 'notifications',
  attachments: 'attachments',
};

const BUCKET = 'attachments';

const toSnake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const toCamel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

function mapKeys(obj: Record<string, unknown>, fn: (k: string) => string) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[fn(k)] = v;
  return out;
}

export function createSupabaseRepository(userId: ID): Repository {
  const sb = getSupabase();

  const check = (error: { message: string } | null) => {
    if (error) throw new Error(error.message);
  };

  return {
    mode: 'supabase',
    userId,
    async load() {
      const data: UserData = structuredClone(EMPTY_DATA);
      await Promise.all(
        COLLECTIONS.map(async (c) => {
          const { data: rows, error } = await sb.from(TABLES[c]).select('*').eq('user_id', userId);
          check(error);
          (data[c] as unknown[]) = (rows ?? []).map((r) => mapKeys(r, toCamel));
        }),
      );
      const { data: s, error } = await sb.from('user_settings').select('*').eq('user_id', userId).maybeSingle();
      check(error);
      data.settings = s ? (mapKeys(s, toCamel) as unknown as UserSettings) : null;
      return data;
    },
    async insert<K extends CollectionName>(collection: K, rows: CollectionRecord<K>[]) {
      if (!rows.length) return;
      const payload = rows.map((r) => {
        const { dataUrl: _drop, ...rest } = r as Attachment;
        void _drop;
        return mapKeys({ ...rest, userId } as Record<string, unknown>, toSnake);
      });
      const { error } = await sb.from(TABLES[collection]).insert(payload);
      check(error);
    },
    async update<K extends CollectionName>(collection: K, id: ID, patch: Partial<CollectionRecord<K>>) {
      const { error } = await sb
        .from(TABLES[collection])
        .update(mapKeys(patch as Record<string, unknown>, toSnake))
        .eq('id', id)
        .eq('user_id', userId);
      check(error);
    },
    async remove<K extends CollectionName>(collection: K, ids: ID[]) {
      if (!ids.length) return;
      if (collection === 'attachments') {
        const { data } = await sb.from('attachments').select('storage_path').in('id', ids).eq('user_id', userId);
        const paths = (data ?? []).map((r) => r.storage_path as string).filter(Boolean);
        if (paths.length) await sb.storage.from(BUCKET).remove(paths);
      }
      const { error } = await sb.from(TABLES[collection]).delete().in('id', ids).eq('user_id', userId);
      check(error);
    },
    async saveSettings(settings: UserSettings) {
      const { error } = await sb
        .from('user_settings')
        .upsert(mapKeys({ ...settings, userId } as unknown as Record<string, unknown>, toSnake));
      check(error);
    },
    async storeFile(file: File, attachment: Attachment) {
      const path = `${userId}/${attachment.memoryId}/${attachment.id}-${file.name.replace(/[^\w.-]/g, '_')}`;
      const { error } = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      check(error);
      const { data } = await sb.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
      return { ...attachment, storagePath: path, dataUrl: data?.signedUrl };
    },
    async clearAll() {
      await Promise.all(COLLECTIONS.map((c) => sb.from(TABLES[c]).delete().eq('user_id', userId)));
    },
  };
}
