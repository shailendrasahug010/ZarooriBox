export function formatMoney(amount: number | null | undefined, currency = 'INR'): string {
  if (amount == null || Number.isNaN(amount)) return '';
  const locale = currency === 'INR' ? 'en-IN' : undefined;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

export function uid(prefix = ''): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return prefix ? `${prefix}_${rand}` : rand;
}

export function nowStamp(): string {
  return new Date().toISOString();
}

const LOWER = new Set(['a', 'an', 'the', 'of', 'to', 'for', 'and', 'or', 'in', 'on', 'at', 'from', 'with', 'by']);
const ACRONYMS = new Set([
  'ro', 'ac', 'puc', 'pan', 'emi', 'sip', 'led', 'tv', 'dth', 'rc', 'itr', 'fd', 'lic', 'dl', 'id', 'gst', 'ppf', 'nps', 'usb', 'upi', 'atm', 'otp', 'kyc',
]);

/** "car insurance" -> "Car Insurance", "ro filter change" -> "RO Filter Change". */
export function titleCase(s: string): string {
  const words = s.trim().split(/\s+/).filter(Boolean);
  return words
    .map((w, i) => {
      const lower = w.toLowerCase();
      if (ACRONYMS.has(lower.replace(/[^a-z]/g, ''))) return w.toUpperCase();
      if (i > 0 && LOWER.has(lower)) return lower;
      if (/[A-Z]/.test(w.slice(1))) return w; // keep "iPhone", "WiFi"
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ');
}

export function capitalizeName(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export function plural(n: number, word: string, pluralWord = `${word}s`) {
  return `${n} ${n === 1 ? word : pluralWord}`;
}

/** Accepts "+91 98765 43210", "98765-43210" (assumed India) or "+1 555 000 1111"; returns E.164 or null. */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  let digits = trimmed.replace(/[^\d+]/g, '');
  if (!digits.startsWith('+')) {
    digits = digits.replace(/^0+/, '');
    if (/^[6-9]\d{9}$/.test(digits)) digits = `+91${digits}`;
    else digits = `+${digits}`;
  }
  return /^\+[1-9]\d{6,14}$/.test(digits) ? digits : null;
}
