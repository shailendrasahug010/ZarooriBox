import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BellRing, Check } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { QuickAdd } from '../components/QuickAdd';
import { useToast } from '../components/Toast';
import { Logo, Switch, cx } from '../components/ui';
import { APP_LANGUAGES, setLanguage, useT, type MessageKey } from '../i18n';
import { deviceChannel, type ChannelStatus } from '../lib/notifications/channels';
import { useData, useStore } from '../store/DataProvider';
import type { AppLanguage } from '../types';

type Topic = 'bills' | 'documents' | 'vehicle' | 'home' | 'money' | 'dates' | 'shopping';

const TOPICS: { id: Topic; emoji: string }[] = [
  { id: 'bills', emoji: '🧾' },
  { id: 'documents', emoji: '🛂' },
  { id: 'vehicle', emoji: '🚗' },
  { id: 'home', emoji: '🏠' },
  { id: 'money', emoji: '🤝' },
  { id: 'dates', emoji: '🎂' },
  { id: 'shopping', emoji: '🛒' },
];

/**
 * First-run setup for a new, empty account: what to track, how to be reminded,
 * and adding the first item by typing or voice. Skippable at every step.
 */
export default function Welcome() {
  const { user } = useAuth();
  const store = useStore();
  const data = useData();
  const toast = useToast();
  const navigate = useNavigate();
  const t = useT();
  const settings = data.settings ?? store.settings;
  const [step, setStep] = useState(1);
  const [topics, setTopics] = useState<Topic[]>(['bills', 'documents']);
  const [device, setDevice] = useState<ChannelStatus>(deviceChannel.status());
  const [example, setExample] = useState<{ text: string; n: number }>({ text: '', n: 0 });
  const [added, setAdded] = useState(0);
  const firstName = user?.name.split(' ')[0] ?? '';

  const finish = async () => {
    await store.finishOnboarding().catch(() => {});
    navigate('/app', { replace: true });
  };

  const chooseLanguage = (lang: AppLanguage) => {
    setLanguage(lang);
    void store.setLanguage(lang).catch(() => {});
  };

  const setPref = (patch: Partial<typeof settings.notifications>) =>
    store.updateSettings({ notifications: { ...settings.notifications, ...patch } }).catch((e: Error) => toast.error(e.message));

  const allowDevice = async () => {
    const s = (await deviceChannel.requestAccess?.()) ?? deviceChannel.status();
    setDevice(s);
    if (s === 'ready') await setPref({ browser: true });
  };

  const toggle = (id: Topic) => setTopics((ts) => (ts.includes(id) ? ts.filter((x) => x !== id) : [...ts, id]));
  const examples = (topics.length ? topics : (['bills', 'home', 'money'] as Topic[])).map((id) => t(`ob.ex.${id}` as MessageKey));

  return (
    <div className="mx-auto max-w-xl pb-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <Logo />
        <div className="flex items-center gap-1" role="group" aria-label={t('ob.lang.title')}>
          {APP_LANGUAGES.map((l) => (
            <button key={l.id} type="button" className="chip" aria-pressed={t.lang === l.id} onClick={() => chooseLanguage(l.id)} lang={l.id}>
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 flex items-center gap-2" aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <span key={n} className={cx('h-1.5 flex-1 rounded-full transition', n <= step ? 'bg-brand-600' : 'bg-line')} />
        ))}
      </div>
      <p className="mb-1 text-sm font-semibold text-muted">{t('ob.step', { n: step })}</p>

      {step === 1 && (
        <section className="animate-fade-up" aria-labelledby="ob-1">
          <h1 id="ob-1" className="text-[1.7rem] font-extrabold leading-tight tracking-tight">
            {t('ob.1.title', { name: firstName })}
          </h1>
          <p className="mt-2 text-ink-soft">{t('ob.1.body')}</p>
          <div className="mt-5 grid grid-cols-2 gap-2.5">
            {TOPICS.map((tp) => {
              const on = topics.includes(tp.id);
              return (
                <button
                  key={tp.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(tp.id)}
                  className={cx(
                    'flex min-h-14 items-center gap-3 rounded-2xl border-2 px-3.5 text-left font-semibold transition',
                    on ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-line bg-surface text-ink-soft hover:border-line-strong',
                  )}
                >
                  <span className="text-2xl" aria-hidden="true">
                    {tp.emoji}
                  </span>
                  <span className="flex-1">{t(`ob.topic.${tp.id}` as MessageKey)}</span>
                  {on && <Check className="size-4 text-brand-700" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="animate-fade-up" aria-labelledby="ob-2">
          <h1 id="ob-2" className="text-[1.7rem] font-extrabold leading-tight tracking-tight">
            {t('ob.2.title')}
          </h1>
          <p className="mt-2 text-ink-soft">{t('ob.2.body')}</p>
          <div className="card mt-5 divide-y divide-line p-0">
            <label className="flex min-h-14 items-center justify-between gap-3 px-4">
              <span className="font-semibold">{t('ob.2.time')}</span>
              <input type="time" className="input w-32" value={settings.notifications.digestTime} onChange={(e) => setPref({ digestTime: e.target.value || '08:00' })} />
            </label>
            {device !== 'unsupported' && (
              <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-2">
                <span>
                  <span className="block font-semibold">{t('ob.2.device')}</span>
                  {device === 'blocked' && <span className="block text-sm text-muted">{t('ob.2.deviceBlocked')}</span>}
                </span>
                {device === 'ready' && settings.notifications.browser ? (
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ok">
                    <Check className="size-4" /> {t('ob.2.deviceOn')}
                  </span>
                ) : device !== 'blocked' ? (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={allowDevice}>
                    <BellRing className="size-4" /> {t('ob.2.allow')}
                  </button>
                ) : null}
              </div>
            )}
            {store.mode === 'supabase' && (
              <div className="flex min-h-14 items-center justify-between gap-3 px-4">
                <span className="font-semibold">{t('ob.2.email')}</span>
                <Switch checked={settings.notifications.email} onChange={(v) => setPref({ email: v })} label={t('ob.2.email')} />
              </div>
            )}
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="animate-fade-up" aria-labelledby="ob-3">
          <h1 id="ob-3" className="text-[1.7rem] font-extrabold leading-tight tracking-tight">
            {t('ob.3.title')}
          </h1>
          <p className="mt-2 text-ink-soft">{added ? t('ob.3.added') : t('ob.3.body')}</p>
          <div className="mt-5">
            <QuickAdd key={example.n} initialText={example.text} autoFocus={example.n > 0} onAdded={() => setAdded((n) => n + 1)} showScan={false} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {examples.map((ex) => (
              <button key={ex} type="button" className="chip" onClick={() => setExample((e) => ({ text: ex, n: e.n + 1 }))}>
                {ex.trim()}
                {ex.endsWith(' ') ? '…' : ''}
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="mt-8 flex items-center gap-2">
        {step > 1 ? (
          <button type="button" className="btn btn-ghost" onClick={() => setStep((s) => s - 1)}>
            <ArrowLeft className="size-4" /> {t('ob.back')}
          </button>
        ) : (
          <button type="button" className="btn btn-ghost" onClick={finish}>
            {t('ob.skip')}
          </button>
        )}
        <button type="button" className="btn btn-primary ml-auto px-6" onClick={() => (step < 3 ? setStep((s) => s + 1) : finish())}>
          {step < 3 ? t('ob.next') : t('ob.finish')} <ArrowRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
