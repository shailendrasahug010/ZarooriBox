import { describe, expect, it } from 'vitest';
import { normalizePhone } from './format';

describe('normalizePhone', () => {
  it('turns common Indian formats into E.164', () => {
    expect(normalizePhone('98765 43210')).toBe('+919876543210');
    expect(normalizePhone('098765-43210')).toBe('+919876543210');
    expect(normalizePhone('+91 98765 43210')).toBe('+919876543210');
  });
  it('keeps other countries when a code is given', () => {
    expect(normalizePhone('+1 (555) 000-1111')).toBe('+15550001111');
  });
  it('rejects junk', () => {
    expect(normalizePhone('12')).toBeNull();
    expect(normalizePhone('call me')).toBeNull();
    expect(normalizePhone('')).toBeNull();
  });
});
