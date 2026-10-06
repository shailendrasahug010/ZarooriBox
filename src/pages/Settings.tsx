import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, Download, LogOut, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { ConfirmDialog } from '../components/Modal';
import { useToast } from '../components/Toast';
import { Field, PageHeader, cx } from '../components/ui';
import { CHANNELS, browserChannel, type ChannelStatus } from '../lib/notifications/channels';
import { EARLY_ACCESS, PLANS } from '../lib/plans';
import { useData, useStore } from '../store/DataProvider';
import type { NotificationPrefs } from '../types';

function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:opacity-40',
        checked ? 'bg-brand-600' : 'bg-line-strong',
      )}
    >
      <span className={cx('inline-block size-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-6' : 'translate-x-1')} />
    </button>
  );
}

function Section({ id, title, children, description }: { id?: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section id={id} className="card animate-fade-up scroll-mt-24 p-4 sm:p-6" aria-labelledby={`${id ?? title}-h`}>
      <h2 id={`${id ?? title}-h`} className="text-lg font-bold">
        {title}
      </h2>
      {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

const STATUS_TEXT: Record<ChannelStatus, string> = {
  ready: 'Allowed on this device',
  needs_permission: 'Your browser will ask for permission',
  blocked: 'Blocked in browser settings',
  unsupported: 'Not supported in this browser',
  coming_soon: 'Coming soon',
};

export default function Settings() {
  const { user, signOut, updateProfile } = useAuth();
  const store = useStore();
  const data = useData();
  const toast = useToast();
  const navigate = useNavigate();
  const settings = data.settings ?? store.settings;
  const [name, setName] = useState(user?.name ?? '');
  const [nameError, setNameError] = useState('');
  const [browserStatus, setBrowserStatus] = useState<ChannelStatus>(browserChannel.status());
  const [confirm, setConfirm] = useState<'reset' | 'delete' | null>(null);

  useEffect(() => {
    if (location.hash) document.querySelector(location.hash)?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const setPref = async (patch: Partial<NotificationPrefs>) => {
    try {
      await store.updateSettings({ notifications: { ...settings.notifications, ...patch } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save.');
    }
  };

  const toggleBrowser = async (on: boolean) => {
    if (on && browserStatus !== 'ready') {
      const s = (await browserChannel.requestAccess?.()) ?? 'unsupported';
      setBrowserStatus(s);
      if (s !== 'ready') {
        toast.error(s === 'blocked' ? 'Notifications are blocked. Allow them in your browser’s site settings.' : 'Notifications aren’t available here.');
        return;
      }
    }
    await setPref({ browser: on });
    if (on) toast.success('Browser notifications on');
  };

  const saveName = async () => {
    try {
      setNameError('');
      await updateProfile({ name });
      toast.success('Name updated');
    } catch (e) {
      setNameError(e instanceof Error ? e.message : 'Could not save.');
    }
  };

  const exportData = () => {
    const blob = new Blob([store.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `lifebox-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader title="Settings" subtitle={user?.email} />

      <Section title="Profile">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Your name" htmlFor="set-name" error={nameError} className="flex-1">
            <input id="set-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} aria-invalid={!!nameError} />
          </Field>
          <button type="button" className="btn btn-secondary" onClick={saveName} disabled={name.trim() === user?.name}>
            Save
          </button>
        </div>
      </Section>

      <Section id="notifications" title="Notifications" description="How LifeBox reaches you when something is due.">
        <ul className="divide-y divide-line">
          <li className="flex items-center gap-4 py-3">
            <div className="flex-1">
              <p className="font-semibold">In-app reminders</p>
              <p className="text-sm text-muted">The bell at the top. Always on.</p>
            </div>
            <Switch checked label="In-app reminders" onChange={() => {}} disabled />
          </li>
          {CHANNELS.map((c) => {
            const isBrowser = c.id === 'browser';
            const status = isBrowser ? browserStatus : c.status();
            const key = c.id as keyof NotificationPrefs;
            return (
              <li key={c.id} className="flex items-center gap-4 py-3">
                <div className="flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {c.label}
                    {status === 'coming_soon' && <span className="rounded-full bg-ink/5 px-2 py-0.5 text-xs font-semibold text-muted">Coming soon</span>}
                    {c.pro && <span className="inline-flex items-center gap-1 rounded-full bg-soon-bg px-2 py-0.5 text-xs font-semibold text-soon"><Crown className="size-3" aria-hidden="true" /> Pro</span>}
                  </p>
                  <p className="text-sm text-muted">{c.description}</p>
                  {isBrowser && <p className="mt-0.5 text-xs text-muted">{STATUS_TEXT[status]}</p>}
                </div>
                <Switch
                  label={c.label}
                  checked={isBrowser ? settings.notifications.browser && status === 'ready' : false}
                  disabled={!isBrowser || status === 'unsupported'}
                  onChange={(v) => (isBrowser ? toggleBrowser(v) : setPref({ [key]: v }))}
                />
              </li>
            );
          })}
        </ul>
        {settings.notifications.browser && browserStatus === 'ready' && (
          <button
            type="button"
            className="btn btn-secondary btn-sm mt-2"
            onClick={() => browserChannel.send({ title: 'LifeBox test 👋', body: 'Notifications are working on this device.' })}
          >
            Send a test notification
          </button>
        )}
        <div className="mt-5 grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
          <div className="flex items-center gap-4 sm:col-span-2">
            <div className="flex-1">
              <p className="font-semibold">Morning summary</p>
              <p className="text-sm text-muted">One calm message with everything due that day.</p>
            </div>
            <Switch label="Morning summary" checked={settings.notifications.dailyDigest} onChange={(v) => setPref({ dailyDigest: v })} />
          </div>
          <Field label="Summary time" htmlFor="set-digest">
            <input id="set-digest" type="time" className="input" value={settings.notifications.digestTime} onChange={(e) => setPref({ digestTime: e.target.value })} disabled={!settings.notifications.dailyDigest} />
          </Field>
          <Field label="Default reminder for new items" htmlFor="set-reminder">
            <select
              id="set-reminder"
              className="input"
              value={settings.defaultReminderDays}
              onChange={(e) => store.updateSettings({ defaultReminderDays: Number(e.target.value) })}
            >
              <option value={0}>On the day</option>
              <option value={1}>1 day before</option>
              <option value={3}>3 days before</option>
              <option value={7}>1 week before</option>
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Your plan">
        <div className="grid gap-3 sm:grid-cols-2">
          {(['free', 'pro'] as const).map((p) => {
            const plan = PLANS[p];
            const current = p === settings.plan;
            return (
              <div key={p} className={cx('rounded-2xl border p-4', current ? 'border-brand-300 bg-brand-50/50' : 'border-line')}>
                <p className="flex items-center gap-2 font-bold">
                  {p === 'pro' && <Crown className="size-4 text-soon" aria-hidden="true" />}
                  {plan.name}
                  {current && <span className="rounded-full bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white">Current</span>}
                </p>
                <p className="text-sm text-muted">{plan.priceLabel}</p>
                <ul className="mt-3 space-y-1 text-sm text-ink-soft">
                  {plan.highlights.map((h) => (
                    <li key={h}>✓ {h}</li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        {EARLY_ACCESS && <p className="mt-3 rounded-xl bg-soon-bg px-3 py-2 text-sm text-soon">🎁 Early access: every Pro feature that exists today is unlocked for free.</p>}
      </Section>

      <Section title="Privacy & data">
        <p className="flex gap-2 text-sm text-ink-soft">
          <ShieldCheck className="size-5 shrink-0 text-brand-600" aria-hidden="true" />
          {store.mode === 'local'
            ? 'Your LifeBox is stored only in this browser on this device. Nobody else, including us, can see it.'
            : 'Your LifeBox is stored in your private account. Database rules make sure only you can read or change it.'}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary btn-sm" onClick={exportData}>
            <Download className="size-4" aria-hidden="true" /> Export my data
          </button>
          {user?.isDemo && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirm('reset')}>
              <RotateCcw className="size-4" aria-hidden="true" /> Reset demo data
            </button>
          )}
          <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirm('delete')}>
            <Trash2 className="size-4" aria-hidden="true" /> Delete all my data
          </button>
        </div>
      </Section>

      <button
        type="button"
        className="btn btn-secondary w-full"
        onClick={async () => {
          await signOut();
          navigate('/');
        }}
      >
        <LogOut className="size-4" aria-hidden="true" /> Log out
      </button>

      <ConfirmDialog
        open={confirm === 'reset'}
        title="Reset demo data?"
        body="Your changes in the demo will be replaced with the original sample data."
        confirmLabel="Reset"
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          setConfirm(null);
          await store.resetDemoData();
          toast.success('Demo data restored');
        }}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        title="Delete everything?"
        body="All memories, reminders, lists and people in your LifeBox will be permanently deleted. This can’t be undone."
        confirmLabel="Delete everything"
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          setConfirm(null);
          await store.deleteAllData();
          toast.success('Your LifeBox is now empty');
        }}
      />
    </div>
  );
}
