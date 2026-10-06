// Signed links for the Done / Snooze buttons in reminder emails. A token names one
// person and one item, expires after 30 days, and is signed with a server secret,
// so it can't be forged or pointed at someone else's item.

import type { ActionTarget } from './reminderPlan.ts';

export interface ActionClaims extends ActionTarget {
  userId: string;
  /** Expiry, seconds since 1970. */
  exp: number;
}

const TTL_SECONDS = 30 * 86400;

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

async function key(secret: string) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signAction(secret: string, userId: string, target: ActionTarget, now = Date.now()): Promise<string> {
  const claims = { u: userId, k: target.kind === 'lending' ? 'l' : 'm', i: target.id, e: Math.floor(now / 1000) + TTL_SECONDS };
  const body = b64url(enc.encode(JSON.stringify(claims)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

/** Returns the claims when the token is genuine and unexpired, otherwise null. */
export async function verifyAction(secret: string, token: string, now = Date.now()): Promise<ActionClaims | null> {
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined || token.length > 600) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await key(secret), fromB64url(sig), enc.encode(body));
    if (!ok) return null;
    const c = JSON.parse(new TextDecoder().decode(fromB64url(body)));
    if (typeof c.u !== 'string' || typeof c.i !== 'string' || (c.k !== 'm' && c.k !== 'l') || typeof c.e !== 'number') return null;
    if (c.e * 1000 < now) return null;
    return { userId: c.u, kind: c.k === 'l' ? 'lending' : 'memory', id: c.i, exp: c.e };
  } catch {
    return null;
  }
}

/** The key used to sign links: ACTION_SECRET if set, else the service role key Supabase provides. */
export function actionSecret(env: (k: string) => string | undefined): string | null {
  return env('ACTION_SECRET') ?? env('SUPABASE_SERVICE_ROLE_KEY') ?? null;
}
