import { useSyncExternalStore } from 'react';
import type { AppLanguage } from '../types';
import { en, type MessageKey } from './en';
import { hi } from './hi';

// App-screen translations. English is complete and is the fallback for any key a
// language doesn't have yet. The language comes from the person's settings once
// they are signed in, and from this device before that.

export type { MessageKey };

const DICTS: Record<AppLanguage, Partial<Record<MessageKey, string>>> = { en, hi };

export const APP_LANGUAGES: { id: AppLanguage; label: string; english: string }[] = [
  { id: 'en', label: 'English', english: 'English' },
  { id: 'hi', label: 'हिन्दी', english: 'Hindi' },
];

/** Languages the phone's speech recognizer understands for voice Quick Add. */
export const VOICE_LANGUAGES: { tag: string; label: string }[] = [
  { tag: 'en-IN', label: 'English (India)' },
  { tag: 'hi-IN', label: 'हिन्दी · Hindi' },
  { tag: 'bn-IN', label: 'বাংলা · Bengali' },
  { tag: 'mr-IN', label: 'मराठी · Marathi' },
  { tag: 'te-IN', label: 'తెలుగు · Telugu' },
  { tag: 'ta-IN', label: 'தமிழ் · Tamil' },
  { tag: 'gu-IN', label: 'ગુજરાતી · Gujarati' },
  { tag: 'kn-IN', label: 'ಕನ್ನಡ · Kannada' },
  { tag: 'ml-IN', label: 'മലയാളം · Malayalam' },
  { tag: 'pa-IN', label: 'ਪੰਜਾਬੀ · Punjabi' },
  { tag: 'or-IN', label: 'ଓଡ଼ିଆ · Odia' },
  { tag: 'ur-IN', label: 'اردو · Urdu' },
  { tag: 'en-US', label: 'English (US)' },
  { tag: 'en-GB', label: 'English (UK)' },
];

const KEY = 'zaroori:v1:language';
let current: AppLanguage = read();
if (typeof document !== 'undefined') document.documentElement.lang = current;
const listeners = new Set<() => void>();

function read(): AppLanguage {
  try {
    const v = globalThis.localStorage?.getItem(KEY);
    return v === 'hi' ? 'hi' : 'en';
  } catch {
    return 'en';
  }
}

export function getLanguage(): AppLanguage {
  return current;
}

export function setLanguage(lang: AppLanguage) {
  if (lang !== 'en' && lang !== 'hi') return;
  try {
    globalThis.localStorage?.setItem(KEY, lang);
  } catch {
    /* private mode */
  }
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  if (lang === current) return;
  current = lang;
  listeners.forEach((l) => l());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export type Vars = Record<string, string | number>;

export function translate(lang: AppLanguage, key: MessageKey, vars?: Vars): string {
  let s: string = DICTS[lang][key] ?? en[key];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** Translation outside React (store messages, notifications). */
export function t(key: MessageKey, vars?: Vars): string {
  return translate(current, key, vars);
}

/** Re-renders when the language changes. */
export function useT() {
  const lang = useSyncExternalStore(subscribe, getLanguage, getLanguage);
  return Object.assign((key: MessageKey, vars?: Vars) => translate(lang, key, vars), { lang });
}
