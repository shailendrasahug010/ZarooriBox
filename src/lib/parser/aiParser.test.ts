import { describe, expect, it } from 'vitest';
import { createAiParser, normalizeParsed } from './aiParser';
import { parseQuickAdd } from './ruleParser';

const ctx = { today: '2026-10-06', currency: 'INR' };
const fb = (t: string) => parseQuickAdd(t, ctx);

describe('normalizeParsed', () => {
  it('accepts a well-formed memory and keeps the raw text', () => {
    const out = normalizeParsed(
      {
        kind: 'memory', title: 'Bike insurance', categoryId: 'vehicle', subcategory: 'Insurance', dueDate: '2026-11-17',
        reminderDaysBefore: 7, repeat: { frequency: 'yearly', interval: 1, unit: 'year' }, amount: null, person: null,
        direction: null, lendingKind: null, thing: null, followUpDate: null, shoppingItems: [], isExpiry: true,
      },
      fb('bike insurance renews 17 nov'),
    );
    expect(out).toMatchObject({ kind: 'memory', title: 'Bike insurance', categoryId: 'vehicle', dueDate: '2026-11-17', reminderDaysBefore: 7, isExpiry: true });
    expect(out?.repeat.frequency).toBe('yearly');
    expect(out?.raw).toBe('bike insurance renews 17 nov');
  });

  it('drops invalid fields instead of trusting them', () => {
    const out = normalizeParsed(
      { kind: 'memory', title: 'X', categoryId: 'home', dueDate: '2026-02-31', reminderDaysBefore: -4, amount: 'lots', repeat: { frequency: 'hourly', interval: 1, unit: 'day' } },
      fb('fix tap'),
    );
    expect(out?.dueDate).toBeNull();
    expect(out?.reminderDaysBefore).toBeNull();
    expect(out?.amount).toBeNull();
    expect(out?.repeat.frequency).toBe('never');
  });

  it('rejects unknown kinds, categories and the server fallback signal', () => {
    expect(normalizeParsed({ kind: 'spell', title: 'x', categoryId: 'home' }, fb('x'))).toBeNull();
    expect(normalizeParsed({ kind: 'memory', title: 'x', categoryId: 'secret' }, fb('x'))).toBeNull();
    expect(normalizeParsed({ fallback: true }, fb('x'))).toBeNull();
    expect(normalizeParsed('nope', fb('x'))).toBeNull();
  });

  it('requires a person and amount for money lending', () => {
    const base = { kind: 'lending', title: 'Rahul owes me', categoryId: 'people', direction: 'lent', lendingKind: 'money' };
    expect(normalizeParsed({ ...base, person: null, amount: 500 }, fb('lent 500'))).toBeNull();
    expect(normalizeParsed({ ...base, person: 'Rahul', amount: 500 }, fb('lent rahul 500'))).toMatchObject({ person: 'Rahul', amount: 500, direction: 'lent' });
  });

  it('cleans shopping items', () => {
    const out = normalizeParsed(
      { kind: 'shopping', title: 'Shopping', categoryId: 'shopping', shoppingItems: [{ name: 'Milk', quantity: '2 L', listCategory: 'Grocery' }, { name: '' }, { name: 'Soap', quantity: null, listCategory: 'Weird' }] },
      fb('buy milk and soap'),
    );
    expect(out?.shoppingItems).toEqual([
      { name: 'Milk', quantity: '2 L', listCategory: 'Grocery' },
      { name: 'Soap', quantity: undefined, listCategory: 'Grocery' },
    ]);
  });
});

describe('createAiParser', () => {
  it('falls back to rules when the transport fails or times out', async () => {
    const failing = createAiParser(async () => {
      throw new Error('offline');
    });
    expect((await failing.parse('Buy milk', ctx)).kind).toBe('shopping');
    const slow = createAiParser(() => new Promise(() => {}), 20);
    expect((await slow.parse('Buy milk', ctx)).kind).toBe('shopping');
  });

  it('uses the AI answer when it is valid', async () => {
    const p = createAiParser(async () => ({ kind: 'memory', title: 'Call the plumber', categoryId: 'home', dueDate: '2026-10-08' }));
    const out = await p.parse('ring plumber day after tmrw', ctx);
    expect(out).toMatchObject({ title: 'Call the plumber', categoryId: 'home', dueDate: '2026-10-08', source: 'ai' });
  });
});
