import { useState, type FormEvent } from 'react';
import { Copy, LogOut, Share2, Users } from 'lucide-react';
import { useT } from '../i18n';
import { useData, useStore } from '../store/DataProvider';
import { ValidationError } from '../store/ZarooriStore';
import { ConfirmDialog } from './Modal';
import { useToast } from './Toast';
import { Field } from './ui';

/** Settings → Family: create or join a family, share the invite, see members, leave. */
export function FamilySettings() {
  const store = useStore();
  const data = useData();
  const toast = useToast();
  const t = useT();
  const family = data.family ?? null;
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  if (!store.canUseFamily) return <p className="text-sm text-muted">{t('fam.needsCloud')}</p>;

  const run = async (fn: () => Promise<void>, ok: () => string) => {
    setBusy(true);
    setCodeError('');
    try {
      await fn();
      toast.success(ok());
    } catch (e) {
      if (e instanceof ValidationError) setCodeError(e.message);
      else toast.error(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  if (!family) {
    const create = (e: FormEvent) => {
      e.preventDefault();
      void run(() => store.createFamily(name.trim() || t('fam.defaultName')), () => t('fam.created'));
    };
    const join = (e: FormEvent) => {
      e.preventDefault();
      void run(() => store.joinFamily(code), () => t('fam.joined', { name: store.family?.name ?? '' }));
    };
    return (
      <div className="grid gap-5 sm:grid-cols-2">
        <form onSubmit={create} className="rounded-2xl bg-paper p-4">
          <Field label={t('fam.name')} htmlFor="fam-name">
            <input id="fam-name" className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder={t('fam.namePlaceholder')} />
          </Field>
          <button type="submit" className="btn btn-primary mt-3 w-full" disabled={busy}>
            <Users className="size-4" /> {t('fam.create')}
          </button>
        </form>
        <form onSubmit={join} className="rounded-2xl bg-paper p-4">
          <Field label={t('fam.code')} htmlFor="fam-code" error={codeError}>
            <input
              id="fam-code"
              className="input font-mono uppercase tracking-widest"
              value={code}
              maxLength={12}
              autoCapitalize="characters"
              autoComplete="off"
              onChange={(e) => setCode(e.target.value)}
              placeholder="AB12CD34"
              aria-invalid={!!codeError}
            />
          </Field>
          <button type="submit" className="btn btn-secondary mt-3 w-full" disabled={busy || !code.trim()}>
            {t('fam.joinButton')}
          </button>
        </form>
      </div>
    );
  }

  const inviteText = t('fam.inviteText', { code: family.inviteCode });
  const shareInvite = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'ZarooriBox', text: inviteText });
        return;
      }
    } catch {
      return; // cancelled
    }
    try {
      await navigator.clipboard.writeText(inviteText);
      toast.success(t('fam.copied'));
    } catch {
      window.open(`https://wa.me/?text=${encodeURIComponent(inviteText)}`, '_blank', 'noopener');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-brand-50 p-4">
        <div>
          <p className="text-lg font-bold text-brand-900">{family.name}</p>
          <p className="text-sm text-brand-800">{t('fam.inviteHelp')}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-xl bg-surface px-3 py-2 font-mono text-lg font-bold tracking-widest" aria-label={`${t('fam.invite')}: ${family.inviteCode.split('').join(' ')}`}>
            {family.inviteCode}
          </span>
          <button type="button" className="btn btn-primary btn-sm" onClick={shareInvite}>
            {'share' in navigator ? <Share2 className="size-4" /> : <Copy className="size-4" />} {t('fam.shareInvite')}
          </button>
        </div>
      </div>
      <div>
        <p className="label">{t('fam.members')}</p>
        <ul className="divide-y divide-line">
          {family.members.map((m) => (
            <li key={m.userId} className="flex min-h-12 items-center gap-3">
              <span className="grid size-9 place-items-center rounded-full bg-brand-100 font-bold text-brand-800" aria-hidden="true">
                {m.displayName.slice(0, 1).toUpperCase()}
              </span>
              <span className="flex-1 font-semibold">
                {m.displayName}
                {m.userId === store.user.id && <span className="ml-1.5 text-sm font-normal text-muted">({t('fam.you')})</span>}
              </span>
              {m.role === 'owner' && <span className="text-xs text-muted">{t('fam.owner')}</span>}
            </li>
          ))}
        </ul>
      </div>
      <button type="button" className="btn btn-ghost btn-sm text-attn" onClick={() => setConfirmLeave(true)} disabled={busy}>
        <LogOut className="size-4" /> {t('fam.leave')}
      </button>
      <ConfirmDialog
        open={confirmLeave}
        title={t('fam.leaveConfirmTitle', { name: family.name })}
        body={t('fam.leaveConfirmBody')}
        confirmLabel={t('fam.leave')}
        danger
        onCancel={() => setConfirmLeave(false)}
        onConfirm={() => {
          setConfirmLeave(false);
          void run(() => store.leaveFamily(), () => t('fam.left'));
        }}
      />
    </div>
  );
}
