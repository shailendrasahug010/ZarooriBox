import { Capacitor } from '@capacitor/core';
import { App as NativeApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import type { User as SbUser } from '@supabase/supabase-js';
import type { User } from '../types';
import { getSupabase } from '../data/supabase';
import type { AuthEvent, AuthService } from './types';

/** Deep link the phone app registers (android/ios projects). Add it to Supabase Auth → URL configuration. */
export const NATIVE_AUTH_CALLBACK = 'app.lifebox://auth-callback';

let nativeListenerReady = false;

/** In the phone app, Google sign-in runs in the system browser and returns through a deep link. */
function listenForNativeCallback() {
  if (nativeListenerReady || !Capacitor.isNativePlatform()) return;
  nativeListenerReady = true;
  void NativeApp.addListener('appUrlOpen', async ({ url }) => {
    if (!url.startsWith(NATIVE_AUTH_CALLBACK)) return;
    void Browser.close().catch(() => {});
    const code = new URL(url).searchParams.get('code');
    // onAuthStateChange picks up the new session.
    if (code) await getSupabase().auth.exchangeCodeForSession(code);
  });
}
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
      // With email confirmation on, Supabase creates the account but no session yet.
      if (!data.user || !data.session) throw new AuthError(`Almost there! We sent a link to ${email}. Open it to confirm your account, then log in.`);
      return toUser(data.user);
    },
    async signIn(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      fail(error);
      return toUser(data.user!);
    },
    async signInWithGoogle() {
      if (Capacitor.isNativePlatform()) {
        // Google blocks sign-in inside embedded web views, so use the system browser.
        listenForNativeCallback();
        const { data, error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: NATIVE_AUTH_CALLBACK, skipBrowserRedirect: true } });
        fail(error);
        if (data?.url) await Browser.open({ url: data.url, presentationStyle: 'popover' });
        return;
      }
      const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${location.origin}/app` } });
      fail(error);
    },
    async signInDemo() {
      // Anonymous sign-in must be enabled in Supabase Auth settings.
      const { data, error } = await sb.auth.signInAnonymously({ options: { data: { name: 'Demo' } } });
      if (error && /anonymous/i.test(error.message)) throw new AuthError('The demo isn’t switched on for this LifeBox yet. Sign up instead, it’s free.');
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
    onChange(listener) {
      listenForNativeCallback();
      const map: Record<string, AuthEvent> = { SIGNED_IN: 'signed_in', SIGNED_OUT: 'signed_out', USER_UPDATED: 'updated', PASSWORD_RECOVERY: 'password_recovery' };
      const { data } = sb.auth.onAuthStateChange((event, session) => {
        const e = map[event];
        // Supabase warns against awaiting its own calls inside this callback, so only report.
        if (e) listener(session?.user ? toUser(session.user) : null, e);
      });
      return () => data.subscription.unsubscribe();
    },
    async updateProfile(patch) {
      const { data, error } = await sb.auth.updateUser({ data: patch });
      fail(error);
      return toUser(data.user!);
    },
  };
}
