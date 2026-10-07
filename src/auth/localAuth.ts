import type { User } from '../types';
import type { KeyValueStore } from '../data/localRepository';
import type { AuthService } from './types';
import { hashPassword, randomSalt, randomToken, verifyPassword } from './hash';
import { AuthError, validateEmail, validateName, validatePassword } from './validation';
import { uid } from '../lib/format';

interface StoredUser extends User {
  salt: string;
  passwordHash: string;
}

const USERS = 'zaroori:v1:users';
const SESSION = 'zaroori:v1:session';
const RESETS = 'zaroori:v1:resets';
const ATTEMPTS = 'zaroori:v1:login-attempts';

export const DEMO_EMAIL = 'demo@zaroori.app';
const SESSION_DAYS = 30;
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 60_000;

const publicUser = ({ salt: _s, passwordHash: _p, ...u }: StoredUser): User => {
  void _s;
  void _p;
  return u;
};

/**
 * Browser-only accounts for running ZarooriBox without a backend. Passwords are
 * salted and hashed, sessions expire, and repeated wrong passwords lock the
 * account briefly. Real deployments should use Supabase Auth (see supabaseAuth.ts).
 */
export function createLocalAuth(store: KeyValueStore = localStorage): AuthService {
  const json = <T>(key: string, fallback: T): T => {
    try {
      const raw = store.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  };
  const save = (key: string, v: unknown) => store.setItem(key, JSON.stringify(v));
  const users = () => json<StoredUser[]>(USERS, []);
  const findByEmail = (email: string) => users().find((u) => u.email === email.trim().toLowerCase());

  const startSession = (u: StoredUser) => {
    save(SESSION, { userId: u.id, expiresAt: Date.now() + SESSION_DAYS * 86_400_000 });
    return publicUser(u);
  };

  const createUser = async (name: string, email: string, password: string, isDemo = false) => {
    const salt = randomSalt();
    const user: StoredUser = {
      id: uid('usr'),
      email: email.trim().toLowerCase(),
      name: name.trim(),
      createdAt: new Date().toISOString(),
      isDemo,
      salt,
      passwordHash: await hashPassword(password, salt),
    };
    save(USERS, [...users(), user]);
    return user;
  };

  return {
    mode: 'local',
    supportsGoogle: false,

    async getCurrentUser() {
      const s = json<{ userId: string; expiresAt: number } | null>(SESSION, null);
      if (!s || s.expiresAt < Date.now()) {
        store.removeItem(SESSION);
        return null;
      }
      const u = users().find((x) => x.id === s.userId);
      return u ? publicUser(u) : null;
    },

    async signUp(name, email, password) {
      const err = validateName(name) ?? validateEmail(email) ?? validatePassword(password);
      if (err) throw new AuthError(err);
      if (findByEmail(email)) throw new AuthError('An account with this email already exists. Try logging in.');
      return startSession(await createUser(name, email, password));
    },

    async signIn(email, password) {
      const emailErr = validateEmail(email);
      if (emailErr) throw new AuthError(emailErr);
      const key = email.trim().toLowerCase();
      const attempts = json<Record<string, { count: number; until: number }>>(ATTEMPTS, {});
      const a = attempts[key];
      if (a && a.until > Date.now()) throw new AuthError('Too many attempts. Please wait a minute and try again.');
      const u = findByEmail(email);
      const ok = !!u && (await verifyPassword(password, u.salt, u.passwordHash));
      if (!ok || !u) {
        const count = (a?.until && a.until <= Date.now() ? 0 : a?.count ?? 0) + 1;
        attempts[key] = { count, until: count >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_MS : 0 };
        save(ATTEMPTS, attempts);
        throw new AuthError('That email and password don’t match.');
      }
      delete attempts[key];
      save(ATTEMPTS, attempts);
      return startSession(u);
    },

    async signInWithGoogle() {
      throw new AuthError('Google sign-in needs the Supabase backend. Use email or the demo for now.');
    },

    async signInDemo() {
      const existing = findByEmail(DEMO_EMAIL);
      const u = existing ?? (await createUser('Ananya', DEMO_EMAIL, `demo-${randomToken()}`, true));
      return startSession(u);
    },

    async signOut() {
      store.removeItem(SESSION);
    },

    async requestPasswordReset(email) {
      const err = validateEmail(email);
      if (err) throw new AuthError(err);
      const u = findByEmail(email);
      if (!u || u.isDemo) return {};
      const token = randomToken();
      const resets = json<Record<string, { userId: string; expiresAt: number }>>(RESETS, {});
      resets[token] = { userId: u.id, expiresAt: Date.now() + 30 * 60_000 };
      save(RESETS, resets);
      return { devResetLink: `/reset-password?token=${token}` };
    },

    async resetPassword(token, newPassword) {
      const err = validatePassword(newPassword);
      if (err) throw new AuthError(err);
      const resets = json<Record<string, { userId: string; expiresAt: number }>>(RESETS, {});
      const r = token ? resets[token] : undefined;
      if (!token || !r || r.expiresAt < Date.now()) throw new AuthError('This reset link has expired. Request a new one.');
      const all = users();
      const u = all.find((x) => x.id === r.userId);
      if (!u) throw new AuthError('This reset link has expired. Request a new one.');
      u.salt = randomSalt();
      u.passwordHash = await hashPassword(newPassword, u.salt);
      save(USERS, all);
      delete resets[token];
      save(RESETS, resets);
    },

    async updateProfile(patch) {
      const current = await this.getCurrentUser();
      if (!current) throw new AuthError('Please log in again.');
      if (patch.name !== undefined) {
        const err = validateName(patch.name);
        if (err) throw new AuthError(err);
      }
      const all = users();
      const u = all.find((x) => x.id === current.id)!;
      if (patch.name !== undefined) u.name = patch.name.trim();
      save(USERS, all);
      return publicUser(u);
    },
  };
}
