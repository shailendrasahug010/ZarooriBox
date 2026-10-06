import type { Attachment, CollectionName, CollectionRecord, Family, ID, UserData, UserSettings } from '../types';
import { COLLECTIONS, EMPTY_DATA, type FamilyService, type Repository } from './repository';
import { getSupabase } from './supabase';

// Supabase/PostgreSQL adapter. Tables and row-level security live in
// supabase/schema.sql; RLS guarantees a user can only touch their own rows and
// the rows their family shares, even if this client code were tampered with.

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

/** Tables whose rows can be shared with a family. The rest are always private. */
const SHAREABLE = new Set<CollectionName>(['memories', 'reminders', 'recurrences', 'attachments', 'shopping']);

function familyService(sb: ReturnType<typeof getSupabase>, userId: ID): FamilyService {
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { error } = await sb.rpc(fn, args);
    if (error) throw new Error(error.message);
  };
  return {
    async load() {
      const { data: members, error } = await sb.from('household_members').select('household_id, user_id, display_name, role').eq('active', true);
      if (error) throw new Error(error.message);
      const mine = members?.find((m) => m.user_id === userId);
      if (!mine) return null;
      const { data: h, error: hErr } = await sb.from('households').select('id, name, invite_code').eq('id', mine.household_id).maybeSingle();
      if (hErr) throw new Error(hErr.message);
      if (!h) return null;
      const family: Family = {
        id: h.id,
        name: h.name,
        inviteCode: h.invite_code,
        members: (members ?? [])
          .filter((m) => m.household_id === h.id)
          .map((m) => ({ userId: m.user_id, displayName: m.display_name || 'Family member', role: m.role })),
      };
      return family;
    },
    create: (name, displayName) => rpc('create_household', { p_name: name, p_display_name: displayName }),
    join: (code, displayName) => rpc('join_household', { p_code: code, p_display_name: displayName }),
    leave: () => rpc('leave_household', {}),
  };
}

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

  const family = familyService(sb, userId);

  return {
    mode: 'supabase',
    userId,
    family,
    async load() {
      const data: UserData = structuredClone(EMPTY_DATA);
      await Promise.all(
        COLLECTIONS.map(async (c) => {
          // Shareable tables: RLS returns this user's rows plus their family's shared ones.
          const q = sb.from(TABLES[c]).select('*');
          const { data: rows, error } = await (SHAREABLE.has(c) ? q : q.eq('user_id', userId));
          check(error);
          (data[c] as unknown[]) = (rows ?? []).map((r) => mapKeys(r, toCamel));
        }),
      );
      const { data: s, error } = await sb.from('user_settings').select('*').eq('user_id', userId).maybeSingle();
      check(error);
      data.settings = s ? (mapKeys(s, toCamel) as unknown as UserSettings) : null;
      // Files live in private storage; signed links let this session open them.
      const paths = data.attachments.map((a) => a.storagePath).filter((p): p is string => !!p);
      if (paths.length) {
        const { data: signed } = await sb.storage.from(BUCKET).createSignedUrls(paths, 60 * 60 * 12);
        const urls = new Map((signed ?? []).map((x) => [x.path, x.signedUrl]));
        data.attachments = data.attachments.map((a) => (a.storagePath && urls.get(a.storagePath) ? { ...a, dataUrl: urls.get(a.storagePath)! } : a));
      }
      data.family = await family.load().catch(() => null);
      return data;
    },
    async insert<K extends CollectionName>(collection: K, rows: CollectionRecord<K>[]) {
      if (!rows.length) return;
      const payload = rows.map((r) => {
        const { dataUrl: _drop, ...rest } = r as Attachment;
        void _drop;
        // A family member adding to a shared memory writes the row as the memory's owner.
        return mapKeys({ ...rest, userId: (r as { userId?: ID }).userId || userId } as Record<string, unknown>, toSnake);
      });
      const { error } = await sb.from(TABLES[collection]).insert(payload);
      check(error);
    },
    async update<K extends CollectionName>(collection: K, id: ID, patch: Partial<CollectionRecord<K>>) {
      const { error } = await sb
        .from(TABLES[collection])
        .update(mapKeys(patch as Record<string, unknown>, toSnake))
        .eq('id', id);
      check(error);
    },
    async remove<K extends CollectionName>(collection: K, ids: ID[]) {
      if (!ids.length) return;
      if (collection === 'attachments') {
        const { data } = await sb.from('attachments').select('storage_path').in('id', ids);
        const paths = (data ?? []).map((r) => r.storage_path as string).filter(Boolean);
        if (paths.length) await sb.storage.from(BUCKET).remove(paths);
      }
      const { error } = await sb.from(TABLES[collection]).delete().in('id', ids);
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
