// Text size and light/dark look. These are per device (a parent's phone may want
// bigger text than the same account on a laptop), kept in localStorage and applied
// to <html> before the first screen draws.

export type TextSize = 'normal' | 'large' | 'xlarge';
export type Theme = 'auto' | 'light' | 'dark';

export interface Appearance {
  textSize: TextSize;
  theme: Theme;
}

const KEY = 'zaroori:v1:appearance';
export const DEFAULT_APPEARANCE: Appearance = { textSize: 'normal', theme: 'auto' };
/** Root font size; every size in the app is in rem, so everything scales together. */
export const TEXT_SCALE: Record<TextSize, string> = { normal: '100%', large: '112.5%', xlarge: '125%' };

export function readAppearance(): Appearance {
  try {
    const v = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? 'null') as Partial<Appearance> | null;
    return {
      textSize: v?.textSize && v.textSize in TEXT_SCALE ? v.textSize : DEFAULT_APPEARANCE.textSize,
      theme: v?.theme === 'light' || v?.theme === 'dark' ? v.theme : 'auto',
    };
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

const prefersDark = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;

/** The theme actually shown: "auto" follows the phone's dark mode. */
export function resolvedTheme(theme: Theme): 'light' | 'dark' {
  return theme === 'auto' ? (prefersDark() ? 'dark' : 'light') : theme;
}

export function applyAppearance(a: Appearance = readAppearance()) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.fontSize = TEXT_SCALE[a.textSize];
  const dark = resolvedTheme(a.theme) === 'dark';
  root.dataset.theme = dark ? 'dark' : 'light';
  root.style.colorScheme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#141311' : '#F7F5F2');
}

export function saveAppearance(a: Appearance) {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(a));
  } catch {
    /* still applies for this visit */
  }
  applyAppearance(a);
}

/** Applies the saved look now, and follows the phone's dark mode while on "auto". */
export function initAppearance() {
  applyAppearance();
  if (typeof matchMedia === 'function') {
    matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
      if (readAppearance().theme === 'auto') applyAppearance();
    });
  }
}
