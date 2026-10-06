export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateEmail(email: string): string | null {
  if (!email.trim()) return 'Enter your email address.';
  if (!EMAIL_RE.test(email.trim())) return 'That email address doesn’t look right.';
  return null;
}

export function validatePassword(pw: string): string | null {
  if (pw.length < 8) return 'Use at least 8 characters.';
  if (pw.length > 128) return 'That password is too long.';
  if (!/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) return 'Mix letters and numbers.';
  return null;
}

export function validateName(name: string): string | null {
  if (!name.trim()) return 'Tell us what to call you.';
  if (name.trim().length > 60) return 'Keep it under 60 characters.';
  return null;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}
