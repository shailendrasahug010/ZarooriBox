import { Capacitor } from '@capacitor/core';
import { App as NativeApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import type { User as SbUser } from '@supabase/supabase-js';
import type { User } from '../types';
import { getSupabase } from '../data/supabase';
import type { AuthEvent, AuthService } from './types';
import { createLocalAuth } from './localAuth';

/** Deep link the phone app registers (android/ios projects). Add it to Supabase Auth → URL configuration. */
export const NATIVE_AUTH_CALLBACK = 'app.zaroori://auth-callback';

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

/** Set while the on-device demo is in use (guest sign-in switched off on the server). */
const DEVICE_DEMO = 'zaroori:v1:device-demo';

function deviceDemoOn(): boolean {
  try {
    return localStorage.getItem(DEVICE_DEMO) === '1';
  } catch {
    return false;
  }
}

function setDeviceDemo(on: boolean) {
  try {
    if (on) localStorage.setItem(DEVICE_DEMO, '1');
    else localStorage.removeItem(DEVICE_DEMO);
  } catch {
    /* private mode */
  }
}

/** Which sign-in methods the server has switched on (Supabase Auth → Sign In / Providers). */
async function providers(): Promise<Record<string, boolean> | null> {
  try {
    const url = import.meta.env.VITE_SUPABASE_URL as string;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
    return res.ok ? ((await res.json()).external as Record<string, boolean>) : null;
  } catch {
    return null;
  }
}

/** Where the confirmation and reset emails should bring people back to. */
const appLink = (path: string) => (Capacitor.isNativePlatform() ? NATIVE_AUTH_CALLBACK : `${location.origin}${path}`);

export function createSupabaseAuth(): AuthService {
  const sb = getSupabase();
  const device = createLocalAuth();
  const deviceDemo = async () => {
    const u = await device.signInDemo();
    setDeviceDemo(true);
    return { ...u, onDevice: true };
  };
  const fail = (e: { message: string } | null) => {
    if (e) throw new AuthError(e.message);
  };
  return {
    mode: 'supabase',
    supportsGoogle: true,
    async getCurrentUser() {
      if (deviceDemoOn()) {
        const u = await device.getCurrentUser();
        if (u?.isDemo) return { ...u, onDevice: true };
        setDeviceDemo(false);
      }
      const { data } = await sb.auth.getUser();
      return data.user ? toUser(data.user) : null;
    },
    async signUp(name, email, password) {
      const err = validateName(name) ?? validateEmail(email) ?? validatePassword(password);
      if (err) throw new AuthError(err);
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: appLink('/app') } });
      fail(error);
      // With email confirmation on, Supabase creates the account but no session yet.
      if (!data.user || !data.session) throw new AuthError(`Almost there! We sent a link to ${email}. Open it to confirm your account, then come back here and log in.`);
      setDeviceDemo(false);
      return toUser(data.user);
    },
    async signIn(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error && /not confirmed/i.test(error.message)) throw new AuthError('Please confirm your email first: open the link we sent you, then log in.');
      if (error && /invalid login credentials/i.test(error.message)) throw new AuthError('That email and password don’t match.');
      fail(error);
      setDeviceDemo(false);
      return toUser(data.user!);
    },
    async signInWithGoogle() {
      if ((await providers())?.google === false) throw new AuthError('Google sign-in isn’t switched on for Zaroori yet. Use your email instead.');
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
      // A server demo needs "Anonymous sign-ins" on in Supabase Auth. Without it the
      // demo runs on this device only, with sample data and nothing sent to the server.
      if ((await providers())?.anonymous_users === false) return deviceDemo();
      const { data, error } = await sb.auth.signInAnonymously({ options: { data: { name: 'Demo' } } });
      if (error && /anonymous/i.test(error.message)) return deviceDemo();
      fail(error);
      setDeviceDemo(false);
      return toUser(data.user!);
    },
    async signOut() {
      if (deviceDemoOn()) {
        setDeviceDemo(false);
        await device.signOut();
        return;
      }
      await sb.auth.signOut();
    },
    async requestPasswordReset(email) {
      const err = validateEmail(email);
      if (err) throw new AuthError(err);
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: appLink('/reset-password') });
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
        if (deviceDemoOn() && !session) return;
        // Supabase warns against awaiting its own calls inside this callback, so only report.
        if (e) listener(session?.user ? toUser(session.user) : null, e);
      });
      return () => data.subscription.unsubscribe();
    },
    async updateProfile(patch) {
      if (deviceDemoOn()) return { ...(await device.updateProfile(patch)), onDevice: true };
      const { data, error } = await sb.auth.updateUser({ data: patch });
      fail(error);
      return toUser(data.user!);
    },
  };
}
