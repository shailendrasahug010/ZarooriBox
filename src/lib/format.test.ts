import { describe, expect, it } from 'vitest';
import { normalizePhone, shortTitle } from './format';

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

describe('shortTitle', () => {
  it('keeps short names as they are', () => {
    expect(shortTitle('Call Amit')).toBe('Call Amit');
  });
  it('uses the first clause of a long note', () => {
    expect(shortTitle('Call the plumber about the kitchen tap, it has been leaking for a week and the floor is getting wet')).toBe('Call the plumber about the kitchen tap');
  });
  it('cuts at a word when there is no clause', () => {
    const t = shortTitle('Ask the society office about the parking sticker renewal form for the new car and the scooter both');
    expect(t.length).toBeLessThanOrEqual(61);
    expect(t.endsWith('…')).toBe(true);
    expect(t).not.toMatch(/\s…$/);
  });
});
