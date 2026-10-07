import type { User } from '../types';

export interface ResetRequestResult {
  /** Local mode has no mail server, so it hands back the link to show on screen. */
  devResetLink?: string;
}

/** Auth port: local (browser) and Supabase implementations share this shape. */
export interface AuthService {
  readonly mode: 'local' | 'supabase';
  readonly supportsGoogle: boolean;
  getCurrentUser(): Promise<User | null>;
  signUp(name: string, email: string, password: string): Promise<User>;
  signIn(email: string, password: string): Promise<User>;
  signInWithGoogle(): Promise<void>;
  signInDemo(): Promise<User>;
  signOut(): Promise<void>;
  requestPasswordReset(email: string): Promise<ResetRequestResult>;
  /** token is required in local mode; Supabase uses the recovery session from the email link. */
  resetPassword(token: string | null, newPassword: string): Promise<void>;
  updateProfile(patch: { name?: string }): Promise<User>;
  /** Permanently deletes the signed-in account and everything in it, then signs out. */
  deleteAccount(): Promise<void>;
  /**
   * Sign-in changes that happen outside the app's own calls: returning from Google,
   * opening a password-reset link, a session expiring, signing out in another tab.
   */
  onChange?(listener: (user: User | null, event: AuthEvent) => void): () => void;
}

export type AuthEvent = 'signed_in' | 'signed_out' | 'updated' | 'password_recovery';
