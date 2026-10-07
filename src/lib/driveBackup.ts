import { Capacitor } from '@capacitor/core';
import { getSupabase } from '../data/supabase';

// Talks to the drive-backup server function (supabase/functions/drive-backup).

export interface DriveStatus {
  available: boolean;
  connected: boolean;
  email?: string | null;
  lastBackupAt?: string | null;
  lastCount?: number | null;
  lastError?: string | null;
}

export interface DriveFinish {
  connected: boolean;
  email: string | null;
  /** A backup that was already on this Drive, e.g. from the old phone. */
  existing: { at: string | null; count: number | null } | null;
}

async function call<T>(action: string, extra: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await getSupabase().functions.invoke('drive-backup', { body: { action, ...extra } });
  if (error) {
    let message = 'Could not reach the backup service. Check your internet and try again.';
    try {
      const body = await (error as { context?: Response }).context?.json();
      if (body?.error) message = body.error;
    } catch {
      /* keep the generic message */
    }
    throw new Error(message);
  }
  return data as T;
}

export const driveStatus = () => call<DriveStatus>('status');
export const driveBackupNow = () => call<{ ok: boolean; at?: string; count?: number; skipped?: string }>('backup');
export const driveDisconnect = () => call<{ connected: false }>('disconnect');
export const driveFinish = (code: string, state: string) => call<DriveFinish>('finish', { code, state });
export const driveRestoreFile = () => call<{ backup: string; at: string | null }>('restore');

/** Opens Google's consent page: the system browser in the phone app, this tab on the web. */
export async function driveConnect() {
  const native = Capacitor.isNativePlatform();
  const { url } = await call<{ url: string }>('connect', { returnTo: native ? 'app' : location.origin });
  if (native) {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url, presentationStyle: 'popover' });
  } else {
    location.assign(url);
  }
}

export async function closeConsentBrowser() {
  if (!Capacitor.isNativePlatform()) return;
  const { Browser } = await import('@capacitor/browser');
  await Browser.close().catch(() => {});
}
