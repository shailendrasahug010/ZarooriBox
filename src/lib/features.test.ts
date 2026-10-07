import { describe, expect, it } from 'vitest';
import { pathForDeepLink } from './appNavigation';
import { fieldsFromScan } from './scan';
import { sharedText } from '../pages/Share';
import { en } from '../i18n/en';
import { hi } from '../i18n/hi';

describe('deep links', () => {
  it.each([
    ['app.zaroori://add?voice=1', '/app?voice=1'],
    ['app.zaroori://add', '/app?add=1'],
    ['app.zaroori://scan', '/app/add?scan=1'],
    ['app.zaroori://shopping', '/app/shopping'],
    ['app.zaroori://share?text=Pay%20rent%20on%205th', '/app/share?text=Pay+rent+on+5th'],
    ['app.zaroori://act?kind=memory&id=m1&do=done', '/app/act?kind=memory&id=m1&do=done'],
    ['https://evil.example/add', null],
    ['app.zaroori://unknown', null],
    ['not a url', null],
  ])('%s', (url, path) => expect(pathForDeepLink(url)).toBe(path));
});

describe('shared text', () => {
  it('joins title, text and link without repeating', () => {
    const p = new URLSearchParams({ title: 'Electricity bill', text: 'Electricity bill due 12 Oct ₹1,240', url: 'https://x.in/b' });
    expect(sharedText(p)).toBe('Electricity bill due 12 Oct ₹1,240 https://x.in/b');
  });
});

describe('document scan results', () => {
  it('fills the form from a good result', () => {
    const r = fieldsFromScan({ isDocument: true, title: 'Car insurance', categoryId: 'vehicle', dueDate: '2027-03-14', amount: 8421.5, provider: 'ICICI Lombard', reminderDaysBefore: 30, repeatYearly: true }, 3);
    expect(r.outcome).toBe('found');
    expect(r.fields).toMatchObject({ title: 'Car insurance', categoryId: 'vehicle', dueDate: '2027-03-14', amount: 8421.5, description: 'ICICI Lombard', reminder: { mode: 'offset', offsetDays: 30 } });
    expect(r.fields.repeat?.frequency).toBe('yearly');
  });

  it('rejects bad values and reports a missing AI key', () => {
    const r = fieldsFromScan({ title: 'Bill', categoryId: 'nope', dueDate: '2027-02-31', amount: -4, reminderDaysBefore: 9999 }, 3);
    expect(r.outcome).toBe('not_found');
    expect(r.fields).toMatchObject({ categoryId: 'documents', dueDate: null, amount: null });
    expect(fieldsFromScan({ fallback: true, reason: 'ai_not_configured' }, 3).outcome).toBe('no_ai');
    expect(fieldsFromScan(null, 3).outcome).toBe('not_found');
  });
});

describe('Hindi translations', () => {
  it('use the same {placeholders} as English', () => {
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [key, value] of Object.entries(hi)) {
      expect(vars(value!), key).toEqual(vars(en[key as keyof typeof en]));
    }
  });
});
