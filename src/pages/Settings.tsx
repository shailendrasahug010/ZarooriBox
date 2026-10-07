import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, Download, LogOut, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { ConfirmDialog } from '../components/Modal';
import { useToast } from '../components/Toast';
import { Field, PageHeader, Switch, cx } from '../components/ui';
import { CHANNELS, deviceChannel, sendServerTest, type ChannelStatus } from '../lib/notifications/channels';
import { isNativeApp, refreshNativeStatus } from '../lib/notifications/native';
import { normalizePhone } from '../lib/format';
import { EARLY_ACCESS, PLANS } from '../lib/plans';
import { useData, useStore } from '../store/DataProvider';
import { FamilySettings } from '../components/FamilySettings';
import { APP_LANGUAGES, VOICE_LANGUAGES, setLanguage, useT } from '../i18n';
import type { NotificationPrefs } from '../types';

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
  server: 'Sent by Zaroori at your summary time',
  needs_cloud: 'Available with a Zaroori cloud account',
};

const CHANNEL_NAMES: Record<string, string> = { email: 'Email', whatsapp: 'WhatsApp', sms: 'SMS' };


export default function Settings() {
  const { user, signOut, updateProfile } = useAuth();
  const store = useStore();
  const data = useData();
  const toast = useToast();
  const navigate = useNavigate();
  const t = useT();
  const settings = data.settings ?? store.settings;
  const [name, setName] = useState(user?.name ?? '');
  const [nameError, setNameError] = useState('');
  const [browserStatus, setBrowserStatus] = useState<ChannelStatus>(deviceChannel.status());
  const [confirm, setConfirm] = useState<'reset' | 'delete' | null>(null);
  const [phone, setPhone] = useState(settings.phone ?? '');
  const [phoneError, setPhoneError] = useState('');
  const [testing, setTesting] = useState(false);
  const serverReady = store.mode === 'supabase';
  const anyServerChannel = serverReady && (settings.notifications.email || settings.notifications.whatsapp || settings.notifications.sms);

  const savePhone = async () => {
    if (!phone.trim()) {
      await store.updateSettings({ phone: null, notifications: { ...settings.notifications, whatsapp: false, sms: false } });
      setPhoneError('');
      toast.success('Phone number removed');
      return;
    }
    const e164 = normalizePhone(phone);
    if (!e164) {
      setPhoneError('Enter a mobile number with country code, like +91 98765 43210.');
      return;
    }
    setPhoneError('');
    setPhone(e164);
    await store.updateSettings({ phone: e164 });
    toast.success('Phone number saved');
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      const results = await sendServerTest();
      const ok = Object.entries(results).filter(([, r]) => r?.ok).map(([c]) => CHANNEL_NAMES[c]);
      const bad = Object.entries(results).filter(([, r]) => !r?.ok).map(([c, r]) => `${CHANNEL_NAMES[c]}${r?.error === 'not_configured' ? ' (not set up on the server yet)' : ''}`);
      if (ok.length) toast.success(`Test sent by ${ok.join(', ')}`);
      if (bad.length) toast.error(`Couldn’t send by ${bad.join(', ')}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not send a test.');
    } finally {
      setTesting(false);
    }
  };

  const toggleServer = async (key: 'email' | 'whatsapp' | 'sms', on: boolean) => {
    if (on && key !== 'email' && !settings.phone) {
      setPhoneError('Add your mobile number first, then switch this on.');
      document.getElementById('set-phone')?.focus();
      return;
    }
    await setPref({ [key]: on });
  };

  useEffect(() => {
    if (isNativeApp()) void refreshNativeStatus().then(setBrowserStatus);
  }, []);

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
      const s = (await deviceChannel.requestAccess?.()) ?? 'unsupported';
      setBrowserStatus(s);
      if (s !== 'ready') {
        toast.error(
          s === 'blocked'
            ? isNativeApp()
              ? 'Notifications are off for Zaroori. Turn them on in your phone’s settings.'
              : 'Notifications are blocked. Allow them in your browser’s site settings.'
            : 'Notifications aren’t available here.',
        );
        return;
      }
    }
    await setPref({ browser: on });
    if (on) toast.success(isNativeApp() ? 'Phone notifications on' : 'Browser notifications on');
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
    a.download = `zaroori-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader title={t('set.title')} subtitle={user?.email} />

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

      <Section id="language" title={t('set.language')} description={t('set.languageDesc')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('set.appLanguage')} htmlFor="set-lang">
            <select
              id="set-lang"
              className="input"
              value={t.lang}
              onChange={(e) => {
                const lang = e.target.value as typeof t.lang;
                setLanguage(lang);
                void store.setLanguage(lang).then(() => toast.success(t('set.saved')));
              }}
            >
              {APP_LANGUAGES.map((l) => (
                <option key={l.id} value={l.id} lang={l.id}>
                  {l.label}
                  {l.label !== l.english ? ` · ${l.english}` : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('set.voiceLanguage')} htmlFor="set-voice-lang">
            <select
              id="set-voice-lang"
              className="input"
              value={settings.voiceLanguage ?? ''}
              onChange={(e) => void store.updateSettings({ voiceLanguage: e.target.value || null }).then(() => toast.success(t('set.saved')))}
            >
              <option value="">{t('set.voiceAuto')}</option>
              {VOICE_LANGUAGES.map((v) => (
                <option key={v.tag} value={v.tag}>
                  {v.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

      <Section id="family" title={t('fam.title')} description={t('fam.description')}>
        <FamilySettings />
      </Section>

      <Section id="notifications" title="Notifications" description="How Zaroori reaches you when something is due.">
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
                    {status === 'needs_cloud' && <span className="rounded-full bg-ink/5 px-2 py-0.5 text-xs font-semibold text-muted">Cloud account</span>}
                    {c.pro && <span className="inline-flex items-center gap-1 rounded-full bg-soon-bg px-2 py-0.5 text-xs font-semibold text-soon"><Crown className="size-3" aria-hidden="true" /> Pro</span>}
                  </p>
                  <p className="text-sm text-muted">{c.description}</p>
                  <p className="mt-0.5 text-xs text-muted">{STATUS_TEXT[status]}</p>
                </div>
                <Switch
                  label={c.label}
                  checked={isBrowser ? settings.notifications.browser && status === 'ready' : status === 'server' && !!settings.notifications[key]}
                  disabled={status === 'unsupported' || status === 'needs_cloud'}
                  onChange={(v) => (isBrowser ? toggleBrowser(v) : toggleServer(key as 'email' | 'whatsapp' | 'sms', v))}
                />
              </li>
            );
          })}
        </ul>
        {serverReady && (
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field label="Mobile number for WhatsApp and SMS" htmlFor="set-phone" error={phoneError} className="flex-1">
              <input
                id="set-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                className="input"
                placeholder="+91 98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                aria-invalid={!!phoneError}
              />
            </Field>
            <button type="button" className="btn btn-secondary" onClick={savePhone} disabled={(normalizePhone(phone) ?? phone.trim()) === (settings.phone ?? '')}>
              Save number
            </button>
          </div>
        )}
        {anyServerChannel && (
          <button type="button" className="btn btn-secondary btn-sm mt-3 mr-2" onClick={sendTest} disabled={testing}>
            {testing ? 'Sending…' : 'Send me a test message'}
          </button>
        )}
        {settings.notifications.browser && browserStatus === 'ready' && (
          <button
            type="button"
            className="btn btn-secondary btn-sm mt-2"
            onClick={() => deviceChannel.send({ title: 'Zaroori test 👋', body: 'Notifications are working on this device.' })}
          >
            Send a test notification
          </button>
        )}
        <div className="mt-5 grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
          <div className="flex items-center gap-4 sm:col-span-2">
            <div className="flex-1">
              <p className="font-semibold">Morning summary</p>
              <p className="text-sm text-muted">One calm message with everything due that day, instead of one per item.</p>
              {serverReady && settings.timezone && <p className="mt-0.5 text-xs text-muted">Times are in your timezone ({settings.timezone}).</p>}
            </div>
            <Switch label="Morning summary" checked={settings.notifications.dailyDigest} onChange={(v) => setPref({ dailyDigest: v })} />
          </div>
          <Field label="Send reminders at" htmlFor="set-digest">
            <input id="set-digest" type="time" className="input" value={settings.notifications.digestTime} onChange={(e) => setPref({ digestTime: e.target.value })} />
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
            ? 'Your Zaroori is stored only in this browser on this device. Nobody else, including us, can see it.'
            : 'Your Zaroori is stored in your private account. Database rules make sure only you can read or change it.'}
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
        body="All memories, reminders, lists and people in your Zaroori will be permanently deleted. This can’t be undone."
        confirmLabel="Delete everything"
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          setConfirm(null);
          await store.deleteAllData();
          toast.success('Your Zaroori is now empty');
        }}
      />
    </div>
  );
}
