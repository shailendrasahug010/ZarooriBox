// Daily backup of each person's ZarooriBox to their own Google Drive, and restore
// from it on a new phone.
//
// The app (signed in, Authorization: Bearer <user token>) POSTs { action }:
//   status      -> { available, connected, email, lastBackupAt, lastCount, lastError }
//   connect     -> { url }  Google's consent page. body.returnTo: the app's web origin, or "app".
//   finish      -> { connected, email, existing }  body.code + body.state from Google's return.
//   backup      -> { ok, at, count }  "Back up now".
//   restore     -> { backup }  the newest backup file's contents.
//   disconnect  -> { connected: false }
// Google sends the browser back here (GET ?code&state); this forwards code and state
// to the app, which finishes the link while signed in. That second step is what stops
// someone from linking another person's Drive to their own account.
// The scheduler (supabase/cron.sql) POSTs with x-cron-secret once a day to back up
// everyone who connected Drive.
//
// Only the drive.file scope is asked for: ZarooriBox can see the files it created and
// nothing else in the person's Drive. Refresh tokens are stored encrypted.
//
// Secrets: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (a Google Cloud "Web application"
// OAuth client whose redirect URI is <SUPABASE_URL>/functions/v1/drive-backup, with the
// Google Drive API enabled). Optional DRIVE_TOKEN_KEY to encrypt tokens with (else the
// service role key). Deploy with --no-verify-jwt; the function checks sign-in itself.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';
import {
  BACKUP_TABLES,
  allowedReturn,
  buildBackup,
  itemCount,
  openToken,
  originOf,
  sealToken,
  signState,
  skipReason,
  verifyState,
} from '../_shared/driveBackup.ts';

const env = (k: string) => Deno.env.get(k);
const CLIENT_ID = env('GOOGLE_CLIENT_ID');
const CLIENT_SECRET = env('GOOGLE_CLIENT_SECRET');
const SECRET = env('DRIVE_TOKEN_KEY') ?? env('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_URL = (env('SUPABASE_URL') ?? '').replace(/\/$/, '');
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/drive-backup`;
const APP_CALLBACK = 'app.zaroori://drive-callback';
const ALLOWED_ORIGINS = [originOf(env('ZAROORI_APP_URL')), originOf(env('ALLOWED_ORIGIN'))].filter((o): o is string => !!o);
const SCOPE = 'openid email https://www.googleapis.com/auth/drive.file';
const FOLDER = 'ZarooriBox';
const FILE = 'ZarooriBox backup.json';
const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

const admin = () => createClient(SUPABASE_URL, env('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const available = () => !!(CLIENT_ID && CLIENT_SECRET && SECRET);

interface LinkRow {
  user_id: string;
  refresh_token: string;
  google_email: string | null;
  folder_id: string | null;
  file_id: string | null;
  last_backup_at: string | null;
  last_count: number | null;
  last_error: string | null;
}

class Fail extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

// ---------- Google ----------

async function tokenRequest(params: Record<string, string>) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID!, client_secret: CLIENT_SECRET!, ...params }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (body.error === 'invalid_grant') throw new Fail('Google Drive access was removed. Connect Google Drive again.', 401);
    throw new Fail(`Google said: ${body.error_description ?? body.error ?? res.status}`, 502);
  }
  return body as { access_token: string; refresh_token?: string; id_token?: string; scope?: string };
}

function emailFromIdToken(idToken?: string): string | null {
  try {
    const part = idToken!.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(part)).email ?? null;
  } catch {
    return null;
  }
}

async function drive(token: string, url: string, init: RequestInit = {}) {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
  if (res.status === 403) throw new Fail('Google Drive refused the backup. Your Drive may be full, or access was limited.', 502);
  return res;
}

async function findFile(token: string, name: string, mime?: string): Promise<{ id: string; modifiedTime: string } | null> {
  const q = [`name = '${name.replace(/'/g, "\\'")}'`, 'trashed = false', mime ? `mimeType = '${mime}'` : ''].filter(Boolean).join(' and ');
  const res = await drive(token, `${DRIVE}/files?q=${encodeURIComponent(q)}&orderBy=modifiedTime desc&pageSize=1&fields=files(id,modifiedTime)`);
  if (!res.ok) return null;
  const { files } = await res.json();
  return files?.[0] ?? null;
}

async function ensureFolder(token: string, link: LinkRow): Promise<string> {
  if (link.folder_id) {
    const res = await drive(token, `${DRIVE}/files/${link.folder_id}?fields=id,trashed`);
    if (res.ok && !(await res.json()).trashed) return link.folder_id;
  }
  const found = await findFile(token, FOLDER, 'application/vnd.google-apps.folder');
  if (found) return found.id;
  const res = await drive(token, `${DRIVE}/files?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER, mimeType: 'application/vnd.google-apps.folder' }),
  });
  if (!res.ok) throw new Fail('Could not create the ZarooriBox folder in Google Drive.', 502);
  return (await res.json()).id;
}

/** Writes the backup, replacing the previous one (Drive keeps earlier versions for a while). */
async function upload(token: string, link: LinkRow, content: string): Promise<{ fileId: string; folderId: string }> {
  if (link.file_id) {
    const res = await drive(token, `${UPLOAD}/files/${link.file_id}?uploadType=media&fields=id,trashed`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: content,
    });
    if (res.ok && !(await res.json()).trashed) return { fileId: link.file_id, folderId: link.folder_id ?? '' };
  }
  const folderId = await ensureFolder(token, link);
  const boundary = `zaroori${crypto.randomUUID()}`;
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name: FILE, parents: [folderId], mimeType: 'application/json' }) +
    `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
  const res = await drive(token, `${UPLOAD}/files?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!res.ok) throw new Fail('Could not save the backup to Google Drive.', 502);
  return { fileId: (await res.json()).id, folderId };
}

async function download(token: string, link: Pick<LinkRow, 'file_id'>): Promise<{ text: string; fileId: string; modifiedTime: string | null } | null> {
  let file: { id: string; modifiedTime: string | null } | null = link.file_id ? { id: link.file_id, modifiedTime: null } : null;
  if (file) {
    const meta = await drive(token, `${DRIVE}/files/${file.id}?fields=id,modifiedTime,trashed`);
    const m = meta.ok ? await meta.json() : null;
    file = m && !m.trashed ? { id: m.id, modifiedTime: m.modifiedTime } : null;
  }
  file ??= await findFile(token, FILE);
  if (!file) return null;
  const res = await drive(token, `${DRIVE}/files/${file.id}?alt=media`);
  if (!res.ok) return null;
  return { text: await res.text(), fileId: file.id, modifiedTime: file.modifiedTime };
}

// ---------- Database ----------

async function getLink(sb: SupabaseClient, userId: string): Promise<LinkRow | null> {
  const { data } = await sb.from('drive_backups').select('*').eq('user_id', userId).maybeSingle();
  return data as LinkRow | null;
}

async function accessToken(link: LinkRow): Promise<string> {
  const refresh = await openToken(SECRET, link.refresh_token);
  if (!refresh) throw new Fail('Connect Google Drive again to keep backing up.', 401);
  return (await tokenRequest({ grant_type: 'refresh_token', refresh_token: refresh })).access_token;
}

async function collect(sb: SupabaseClient, userId: string) {
  const rows: Record<string, Record<string, unknown>[]> = {};
  await Promise.all(
    Object.entries(BACKUP_TABLES).map(async ([name, table]) => {
      const { data, error } = await sb.from(table).select('*').eq('user_id', userId);
      if (error) throw new Fail(`Could not read your items: ${error.message}`, 500);
      rows[name] = data ?? [];
    }),
  );
  const { data: settings } = await sb.from('user_settings').select('*').eq('user_id', userId).maybeSingle();
  const { data: u } = await sb.auth.admin.getUserById(userId);
  const user = { name: (u?.user?.user_metadata?.name as string) ?? undefined, email: u?.user?.email ?? undefined };
  return buildBackup(rows, settings, user);
}

/** Backs up one person. Returns what happened, and records it for the Settings screen. */
async function backupUser(sb: SupabaseClient, link: LinkRow, manual: boolean) {
  const stamp = new Date().toISOString();
  try {
    const backup = await collect(sb, link.user_id);
    const count = itemCount(backup);
    const skip = skipReason(link.last_count, count, manual);
    if (skip) {
      await sb.from('drive_backups').update({ last_error: skip, last_attempt_at: stamp }).eq('user_id', link.user_id);
      return { ok: false, skipped: skip };
    }
    const token = await accessToken(link);
    const { fileId, folderId } = await upload(token, link, JSON.stringify(backup));
    await sb
      .from('drive_backups')
      .update({ file_id: fileId, folder_id: folderId || link.folder_id, last_backup_at: stamp, last_attempt_at: stamp, last_count: count, last_error: null })
      .eq('user_id', link.user_id);
    return { ok: true, at: stamp, count };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Backup failed.';
    await sb.from('drive_backups').update({ last_error: message, last_attempt_at: stamp }).eq('user_id', link.user_id);
    throw e;
  }
}

// ---------- Requests ----------

async function signedInUser(sb: SupabaseClient, req: Request): Promise<string> {
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!jwt) throw new Fail('Please log in again.', 401);
  const { data, error } = await sb.auth.getUser(jwt);
  if (error || !data.user) throw new Fail('Please log in again.', 401);
  if (data.user.is_anonymous) throw new Fail('Google Drive backup needs a ZarooriBox account. Sign up first.', 403);
  return data.user.id;
}

/** Google's return: hand code and state to the app, which finishes while signed in. */
async function googleReturn(url: URL): Promise<Response> {
  const state = await verifyState(SECRET, url.searchParams.get('state') ?? '');
  const params = new URLSearchParams();
  for (const k of ['code', 'state', 'error']) {
    const v = url.searchParams.get(k);
    if (v) params.set(k, v);
  }
  if (!state || !allowedReturn(state.returnTo, ALLOWED_ORIGINS)) {
    return new Response('This Google Drive link has expired. Go back to ZarooriBox and press Connect Google Drive again.', { status: 400 });
  }
  const target = state.returnTo === 'app' ? `${APP_CALLBACK}?${params}` : `${state.returnTo}/app/settings?drive=1&${params}`;
  return new Response(null, { status: 302, headers: { Location: target } });
}

async function handle(sb: SupabaseClient, req: Request, body: Record<string, unknown>) {
  const action = String(body.action ?? 'status');
  if (!available()) {
    if (action === 'status') return { available: false, connected: false };
    throw new Fail('Google Drive backup isn’t set up for ZarooriBox yet.', 503);
  }
  const userId = await signedInUser(sb, req);

  if (action === 'status') {
    const link = await getLink(sb, userId);
    return {
      available: true,
      connected: !!link,
      email: link?.google_email ?? null,
      lastBackupAt: link?.last_backup_at ?? null,
      lastCount: link?.last_count ?? null,
      lastError: link?.last_error ?? null,
    };
  }

  if (action === 'connect') {
    const returnTo = String(body.returnTo ?? '');
    if (!allowedReturn(returnTo, ALLOWED_ORIGINS)) throw new Fail('Google Drive backup can only be connected from the ZarooriBox app or website.', 400);
    const q = new URLSearchParams({
      client_id: CLIENT_ID!,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: SCOPE,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state: await signState(SECRET, userId, returnTo),
    });
    return { url: `https://accounts.google.com/o/oauth2/v2/auth?${q}` };
  }

  if (action === 'finish') {
    const state = await verifyState(SECRET, String(body.state ?? ''));
    if (!state || state.userId !== userId) throw new Fail('This Google Drive link was started from another account or has expired. Try again.', 400);
    const t = await tokenRequest({ grant_type: 'authorization_code', code: String(body.code ?? ''), redirect_uri: REDIRECT_URI });
    if (!t.scope?.includes('drive.file')) throw new Fail('Please tick “See, edit, create and delete only the specific Google Drive files you use with this app” and try again.', 400);
    if (!t.refresh_token) throw new Fail('Google didn’t give ZarooriBox lasting access. Try again.', 502);
    const email = emailFromIdToken(t.id_token);
    const existing = await download(t.access_token, { file_id: null }).catch(() => null);
    let count: number | null = null;
    try {
      count = existing ? itemCount(JSON.parse(existing.text)) : null;
    } catch {
      count = null;
    }
    const row = {
      user_id: userId,
      refresh_token: await sealToken(SECRET, t.refresh_token),
      google_email: email,
      folder_id: null,
      file_id: existing?.fileId ?? null,
      last_backup_at: existing?.modifiedTime ?? null,
      last_count: count,
      last_error: null,
    };
    const { error } = await sb.from('drive_backups').upsert(row);
    if (error) throw new Fail(error.message, 500);
    // A new account with a backup already on Drive: offer to restore before backing up over it.
    if (!existing) await backupUser(sb, row as LinkRow, false).catch(() => {});
    return { connected: true, email, existing: existing ? { at: existing.modifiedTime, count } : null };
  }

  const link = await getLink(sb, userId);
  if (!link) throw new Fail('Connect Google Drive first.', 400);

  if (action === 'backup') return backupUser(sb, link, true);

  if (action === 'restore') {
    const file = await download(await accessToken(link), link);
    if (!file) throw new Fail('There’s no ZarooriBox backup in this Google Drive yet.', 404);
    return { backup: file.text, at: file.modifiedTime };
  }

  if (action === 'disconnect') {
    const refresh = await openToken(SECRET, link.refresh_token);
    if (refresh) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refresh)}`, { method: 'POST' }).catch(() => {});
    await sb.from('drive_backups').delete().eq('user_id', userId);
    return { connected: false };
  }

  throw new Fail('Unknown action.', 400);
}

/** Daily run: everyone whose last backup is older than 20 hours. */
async function runScheduled(sb: SupabaseClient) {
  const since = new Date(Date.now() - 20 * 3600_000).toISOString();
  const { data } = await sb.from('drive_backups').select('*').or(`last_attempt_at.is.null,last_attempt_at.lt.${since}`).limit(500);
  let ok = 0;
  let failed = 0;
  for (const link of (data ?? []) as LinkRow[]) {
    try {
      if ((await backupUser(sb, link, false)).ok) ok++;
    } catch {
      failed++;
    }
  }
  return { checked: data?.length ?? 0, backedUp: ok, failed };
}

async function cronAllowed(sb: SupabaseClient, req: Request): Promise<boolean> {
  const secret = req.headers.get('x-cron-secret');
  if (!secret) return false;
  if (env('CRON_SECRET')) return secret === env('CRON_SECRET');
  const { data } = await sb.rpc('check_cron_secret', { secret });
  return data === true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const url = new URL(req.url);
  if (req.method === 'GET') return googleReturn(url);
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const sb = admin();
  try {
    if (req.headers.get('x-cron-secret')) {
      if (!(await cronAllowed(sb, req))) return json({ error: 'Not allowed' }, 401);
      return json(available() ? await runScheduled(sb) : { skipped: 'not set up' });
    }
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return json(await handle(sb, req, body));
  } catch (e) {
    const status = e instanceof Fail ? e.status : 500;
    return json({ error: e instanceof Error ? e.message : 'Something went wrong.' }, status);
  }
});
