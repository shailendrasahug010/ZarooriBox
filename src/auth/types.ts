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
}
