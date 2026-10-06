import type { User as SbUser } from '@supabase/supabase-js';
import type { User } from '../types';
import { getSupabase } from '../data/supabase';
import type { AuthService } from './types';
import { AuthError, validateEmail, validateName, validatePassword } from './validation';

const toUser = (u: SbUser): User => ({
  id: u.id,
  email: u.email ?? '',
  name: (u.user_metadata?.name as string) || (u.user_metadata?.full_name as string) || u.email?.split('@')[0] || 'there',
  createdAt: u.created_at,
  isDemo: u.is_anonymous ?? false,
});

export function createSupabaseAuth(): AuthService {
  const sb = getSupabase();
  const fail = (e: { message: string } | null) => {
    if (e) throw new AuthError(e.message);
  };
  return {
    mode: 'supabase',
    supportsGoogle: true,
    async getCurrentUser() {
      const { data } = await sb.auth.getUser();
      return data.user ? toUser(data.user) : null;
    },
    async signUp(name, email, password) {
      const err = validateName(name) ?? validateEmail(email) ?? validatePassword(password);
      if (err) throw new AuthError(err);
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name } } });
      fail(error);
      if (!data.user) throw new AuthError('Check your email to confirm your account.');
      return toUser(data.user);
    },
    async signIn(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      fail(error);
      return toUser(data.user!);
    },
    async signInWithGoogle() {
      const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${location.origin}/app` } });
      fail(error);
    },
    async signInDemo() {
      // Anonymous sign-in must be enabled in Supabase Auth settings.
      const { data, error } = await sb.auth.signInAnonymously({ options: { data: { name: 'Demo' } } });
      fail(error);
      return toUser(data.user!);
    },
    async signOut() {
      await sb.auth.signOut();
    },
    async requestPasswordReset(email) {
      const err = validateEmail(email);
      if (err) throw new AuthError(err);
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/reset-password` });
      fail(error);
      return {};
    },
    async resetPassword(_token, newPassword) {
      const err = validatePassword(newPassword);
      if (err) throw new AuthError(err);
      const { error } = await sb.auth.updateUser({ password: newPassword });
      fail(error);
    },
    async updateProfile(patch) {
      const { data, error } = await sb.auth.updateUser({ data: patch });
      fail(error);
      return toUser(data.user!);
    },
  };
}
