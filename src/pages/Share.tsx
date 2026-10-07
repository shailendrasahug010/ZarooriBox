import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { QuickAdd } from '../components/QuickAdd';
import { useToast } from '../components/Toast';
import { PageHeader } from '../components/ui';
import { useT } from '../i18n';

/** Joins what another app shared (title, text, link) into one Quick Add line. */
export function sharedText(params: URLSearchParams): string {
  const parts = [params.get('title'), params.get('text'), params.get('url')].map((p) => p?.trim()).filter((p): p is string => !!p);
  // Many apps repeat the title inside the text; keep each piece once.
  const unique = parts.filter((p, i) => !parts.some((q, j) => j !== i && q.length > p.length && q.includes(p)));
  return [...new Set(unique)].join(' ').replace(/\s+/g, ' ').slice(0, 300);
}

/**
 * "Share to ZarooriBox" from WhatsApp, Gallery, SMS and others lands here.
 * Text goes into Quick Add; a photo goes to document scanning.
 * Android passes shared photos as a file in the app's cache (see MainActivity).
 */
export default function Share() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const t = useT();
  // Only files MainActivity copied into the app's own share folder, never any other path.
  const rawFile = params.get('file');
  const file = rawFile && /\/cache\/shared\/[\w.-]+$/.test(rawFile) && !rawFile.includes('..') ? rawFile : null;
  const text = sharedText(params);
  const started = useRef(false);

  useEffect(() => {
    if (!file || started.current) return;
    started.current = true;
    (async () => {
      try {
        const res = await fetch(Capacitor.convertFileSrc(file));
        const blob = await res.blob();
        const type = params.get('type') || blob.type || 'image/jpeg';
        const shared = new File([blob], file.split('/').pop() || 'shared.jpg', { type });
        navigate('/app/add', { replace: true, state: { scanFile: shared } });
      } catch {
        toast.error(t('common.error'));
        navigate('/app', { replace: true });
      }
    })();
  }, [file, params, navigate, toast, t]);

  if (file) return <p className="py-10 text-center text-muted" role="status">{t('share.photo')}</p>;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t('share.title')} subtitle={text ? t('share.body') : t('share.nothing')} />
      <QuickAdd variant="hero" initialText={text} autoFocus onAdded={() => navigate('/app', { replace: true })} />
    </div>
  );
}
