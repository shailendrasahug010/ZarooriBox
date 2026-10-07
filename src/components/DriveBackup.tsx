import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CloudUpload, HardDriveDownload, Link2Off } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { parseBackup } from '../lib/backup';
import { formatDate } from '../lib/dates';
import {
  closeConsentBrowser,
  driveBackupNow,
  driveConnect,
  driveDisconnect,
  driveFinish,
  driveRestoreFile,
  driveStatus,
  type DriveStatus,
} from '../lib/driveBackup';
import { useStore } from '../store/DataProvider';
import { ConfirmDialog } from './Modal';
import { useToast } from './Toast';

function when(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${formatDate(iso.slice(0, 10))}, ${d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`;
}

function DriveIcon() {
  return (
    <svg viewBox="0 0 87.3 78" className="size-5 shrink-0" aria-hidden="true">
      <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
      <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47" />
      <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.5l5.85 11.5z" fill="#ea4335" />
      <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
      <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
      <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
    </svg>
  );
}

/** Settings: a daily copy of the account in the person's own Google Drive, and restore from it. */
export function DriveBackup() {
  const store = useStore();
  const { user } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState<DriveStatus | null>(null);
  const [busy, setBusy] = useState<'' | 'connect' | 'backup' | 'restore' | 'disconnect'>('');
  const [ask, setAsk] = useState<null | 'restore' | 'disconnect'>(null);
  const [found, setFound] = useState<{ at: string | null; count: number | null } | null>(null);
  const finishing = useRef(false);
  const cloud = store.mode === 'supabase' && !user?.isDemo;

  const refresh = () =>
    driveStatus()
      .then(setStatus)
      .catch(() => setStatus({ available: false, connected: false }));

  // Back from Google's consent page (web redirect, or the phone app's deep link).
  useEffect(() => {
    if (!cloud || params.get('drive') !== '1' || finishing.current) return;
    finishing.current = true;
    const code = params.get('code');
    const state = params.get('state');
    const denied = params.get('error');
    setParams({}, { replace: true });
    void closeConsentBrowser();
    if (denied || !code || !state) {
      toast.error('Google Drive wasn’t connected.');
      void refresh();
      return;
    }
    setBusy('connect');
    driveFinish(code, state)
      .then((r) => {
        toast.success(`Google Drive connected${r.email ? ` (${r.email})` : ''}`);
        if (r.existing) {
          setFound(r.existing);
          setAsk('restore');
        }
      })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => {
        setBusy('');
        void refresh();
      });
  }, [cloud, params]);

  useEffect(() => {
    if (cloud && params.get('drive') !== '1') void refresh();
  }, [cloud]);

  if (!cloud) {
    return (
      <p className="flex gap-2.5 text-sm text-ink-soft">
        <DriveIcon />
        {user?.isDemo ? 'Daily Google Drive backup is for ZarooriBox accounts. Sign up to turn it on.' : 'Google Drive backup needs a ZarooriBox cloud account.'}
      </p>
    );
  }

  const run = async (kind: typeof busy, fn: () => Promise<void>) => {
    setBusy(kind);
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy('');
      void refresh();
    }
  };

  const restore = () =>
    run('restore', async () => {
      const file = await driveRestoreFile();
      const n = await store.restoreBackup(parseBackup(file.backup));
      toast.success(`Restored ${n} item${n === 1 ? '' : 's'} from Google Drive`);
    });

  return (
    <div>
      <p className="flex gap-2.5 text-sm text-ink-soft">
        <DriveIcon />
        <span>
          Every night ZarooriBox saves a copy of everything to your own Google Drive, in a <b>ZarooriBox</b> folder. On a new phone, log in, connect the same Google
          account and restore.
        </span>
      </p>

      {!status && <p className="mt-3 text-sm text-muted" aria-busy="true">Checking…</p>}

      {status && !status.available && (
        <p className="mt-3 rounded-xl bg-paper px-3 py-2 text-sm text-muted">Google Drive backup turns on once it’s set up for ZarooriBox.</p>
      )}

      {status?.available && !status.connected && (
        <button type="button" className="btn btn-secondary mt-4" disabled={!!busy} onClick={() => run('connect', driveConnect)}>
          <DriveIcon /> {busy === 'connect' ? 'Connecting…' : 'Connect Google Drive'}
        </button>
      )}

      {status?.available && status.connected && (
        <>
          <div className="mt-4 rounded-2xl bg-paper p-3.5 text-sm">
            <p className="font-semibold text-ink">Connected{status.email ? ` as ${status.email}` : ''}</p>
            <p className="mt-0.5 text-muted">
              {status.lastBackupAt
                ? `Last backup ${when(status.lastBackupAt)}${status.lastCount != null ? ` · ${status.lastCount} items` : ''}`
                : 'First backup tonight.'}
            </p>
            {status.lastError && <p className="mt-1.5 text-soon">{status.lastError}</p>}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={!!busy}
              onClick={() =>
                run('backup', async () => {
                  const r = await driveBackupNow();
                  if (r.ok) toast.success(`Backed up ${r.count ?? ''} items to Google Drive`);
                })
              }
            >
              <CloudUpload className="size-4" aria-hidden="true" /> {busy === 'backup' ? 'Backing up…' : 'Back up now'}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => { setFound(null); setAsk('restore'); }}>
              <HardDriveDownload className="size-4" aria-hidden="true" /> {busy === 'restore' ? 'Restoring…' : 'Restore from Drive'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm text-muted" disabled={!!busy} onClick={() => setAsk('disconnect')}>
              <Link2Off className="size-4" aria-hidden="true" /> Disconnect
            </button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={ask === 'restore'}
        title={found ? 'Restore your backup?' : 'Restore from Google Drive?'}
        body={
          found
            ? `This Google Drive already has a ZarooriBox backup${found.at ? ` from ${when(found.at)}` : ''}${found.count != null ? ` with ${found.count} items` : ''}. Restore it to this account? What’s in this account now will be replaced.`
            : 'Your items in this account will be replaced by the latest backup in Google Drive.'
        }
        confirmLabel="Restore"
        onCancel={() => setAsk(null)}
        onConfirm={() => {
          setAsk(null);
          void restore();
        }}
      />
      <ConfirmDialog
        open={ask === 'disconnect'}
        title="Stop Google Drive backups?"
        body="ZarooriBox will stop backing up to Google Drive. The backup already in your Drive stays there."
        confirmLabel="Disconnect"
        onCancel={() => setAsk(null)}
        onConfirm={() => {
          setAsk(null);
          void run('disconnect', async () => {
            await driveDisconnect();
            toast.success('Google Drive disconnected');
          });
        }}
      />
    </div>
  );
}
