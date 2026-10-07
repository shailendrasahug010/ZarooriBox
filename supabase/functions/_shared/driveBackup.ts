// Pieces of the Google Drive backup that don't talk to Google or the database,
// so they can be tested: the signed "state" that carries a connect request through
// Google's consent screen, sealing refresh tokens before they are stored, where the
// browser may be sent back to, the backup file's contents and when to skip a backup.

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey('raw', enc.encode(`drive-state:${secret}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export interface DriveState {
  /** The person connecting. */
  userId: string;
  /** Where to send the browser afterwards: an allowed web origin, or "app" for the phone app. */
  returnTo: string;
  exp: number;
}

const STATE_TTL_SECONDS = 15 * 60;

export async function signState(secret: string, userId: string, returnTo: string, now = Date.now()): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify({ u: userId, r: returnTo, e: Math.floor(now / 1000) + STATE_TTL_SECONDS })));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

export async function verifyState(secret: string, state: string, now = Date.now()): Promise<DriveState | null> {
  const [body, sig, extra] = state.split('.');
  if (!body || !sig || extra !== undefined || state.length > 1000) return null;
  try {
    if (!(await crypto.subtle.verify('HMAC', await hmacKey(secret), fromB64url(sig), enc.encode(body)))) return null;
    const c = JSON.parse(dec.decode(fromB64url(body)));
    if (typeof c.u !== 'string' || typeof c.r !== 'string' || typeof c.e !== 'number' || c.e * 1000 < now) return null;
    return { userId: c.u, returnTo: c.r, exp: c.e };
  } catch {
    return null;
  }
}

async function aesKey(secret: string) {
  const raw = await crypto.subtle.digest('SHA-256', enc.encode(`drive-token:${secret}`));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** Encrypts a Google refresh token so the database never holds it in the clear. */
export async function sealToken(secret: string, token: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(secret), enc.encode(token)));
  return `v1.${b64url(iv)}.${b64url(ct)}`;
}

export async function openToken(secret: string, sealed: string): Promise<string | null> {
  const [v, iv, ct] = sealed.split('.');
  if (v !== 'v1' || !iv || !ct) return null;
  try {
    return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64url(iv) }, await aesKey(secret), fromB64url(ct)));
  } catch {
    return null;
  }
}

/**
 * Only these places may receive the Google code after consent: the phone app, the
 * site in ZAROORI_APP_URL / ALLOWED_ORIGIN, and localhost for development. Anything
 * else could let another site catch a code and link someone's Drive to its account.
 */
export function allowedReturn(returnTo: string, allowedOrigins: string[]): boolean {
  if (returnTo === 'app') return true;
  let u: URL;
  try {
    u = new URL(returnTo);
  } catch {
    return false;
  }
  if (u.origin !== returnTo) return false;
  if (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) return true;
  return u.protocol === 'https:' && allowedOrigins.includes(u.origin);
}

export function originOf(url: string | undefined | null): string | null {
  if (!url || url === '*') return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** Database tables in a backup, by the name the app uses for them. */
export const BACKUP_TABLES: Record<string, string> = {
  memories: 'memories',
  reminders: 'reminders',
  recurrences: 'recurring_items',
  people: 'people',
  lendings: 'lendings',
  shopping: 'shopping_items',
  attachments: 'attachments',
};

const toCamel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

function camelRow(row: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[toCamel(k)] = v;
  return out;
}

/** The backup file: the same shape as "Export my data", so either can be restored. */
export function buildBackup(rows: Record<string, Record<string, unknown>[]>, settings: Record<string, unknown> | null, user: { name?: string; email?: string }, now = new Date()) {
  const out: Record<string, unknown> = { app: 'ZarooriBox', version: 1, exportedAt: now.toISOString(), user };
  for (const name of Object.keys(BACKUP_TABLES)) out[name] = (rows[name] ?? []).map(camelRow);
  out.settings = settings ? camelRow(settings) : null;
  return out;
}

export function itemCount(backup: Record<string, unknown>): number {
  const n = (k: string) => (Array.isArray(backup[k]) ? (backup[k] as unknown[]).length : 0);
  return n('memories') + n('lendings') + n('shopping');
}

/**
 * The daily backup never replaces a fuller copy with a near-empty one (say, a new
 * phone that hasn't restored yet). "Back up now" still can, since a person chose it.
 */
export function skipReason(previous: number | null, next: number, manual: boolean): string | null {
  if (manual) return null;
  if (next === 0) return 'Nothing to back up yet.';
  if (previous != null && previous >= 5 && next < previous / 2) {
    return `Skipped: this account has ${next} items but the backup on Drive has ${previous}. Restore it, or press Back up now to replace it.`;
  }
  return null;
}
