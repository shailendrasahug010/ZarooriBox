import { describe, expect, it } from 'vitest';
import { parseBackup, prepareRestore, restoredSettings } from './backup';
import { pathForDeepLink } from './appNavigation';

const backup = {
  exportedAt: '2026-10-01T10:00:00Z',
  settings: { userId: 'old', currency: 'INR', defaultReminderDays: 3, plan: 'pro', phone: '+911' },
  people: [{ id: 'per_1', userId: 'old', name: 'Rahul' }],
  memories: [
    { id: 'mem_1', userId: 'old', title: 'Vitamin D', personId: 'per_1', householdId: 'h1' },
    { id: 'mem_2', userId: 'other', title: 'Shared by family' },
  ],
  reminders: [{ id: 'rem_1', userId: 'old', memoryId: 'mem_1' }, { id: 'rem_x', userId: 'old', memoryId: 'gone' }],
  recurrences: [{ id: 'rec_1', userId: 'old', memoryId: 'mem_1' }],
  lendings: [{ id: 'len_1', userId: 'old', personId: 'per_1' }],
  shopping: [{ id: 'shp_1', userId: 'old', name: 'Milk' }],
  notifications: [{ id: 'ntf_1' }],
  attachments: [{ id: 'att_1', userId: 'old', memoryId: 'mem_1', storagePath: 'old/mem_1/x.jpg', dataUrl: 'https://signed' }],
};

describe('backups', () => {
  it('reads an exported file and refuses anything else', () => {
    expect(parseBackup(JSON.stringify(backup)).memories).toHaveLength(2);
    expect(() => parseBackup('not json')).toThrow(/isn’t a ZarooriBox backup/);
    expect(() => parseBackup('{"memories":[{"title":"no id"}]}')).toThrow(/damaged/);
  });

  it('restores into a new account with fresh ids, links kept, own items only', () => {
    const r = prepareRestore(parseBackup(JSON.stringify(backup)), 'new');
    expect(r.memories).toHaveLength(1); // the family member's item stays theirs
    const m = r.memories[0];
    expect(m.id).not.toBe('mem_1');
    expect(m.id.startsWith('mem_')).toBe(true);
    expect(m.userId).toBe('new');
    expect(m.householdId).toBeNull();
    expect(m.personId).toBe(r.people[0].id);
    expect(r.reminders).toHaveLength(1);
    expect(r.reminders[0].memoryId).toBe(m.id);
    expect(r.recurrences[0].memoryId).toBe(m.id);
    expect(r.lendings[0].personId).toBe(r.people[0].id);
    expect(r.shopping[0].userId).toBe('new');
    // The old account's files can't be opened from the new one.
    expect(r.attachments).toHaveLength(0);
  });

  it('keeps files when restoring into the same account', () => {
    const r = prepareRestore(parseBackup(JSON.stringify(backup)), 'old');
    expect(r.attachments).toHaveLength(1);
    expect(r.attachments[0].memoryId).toBe(r.memories[0].id);
    expect('dataUrl' in r.attachments[0]).toBe(false);
  });

  it('carries preferences but not plan or phone number', () => {
    expect(restoredSettings(parseBackup(JSON.stringify(backup)))).toEqual({ currency: 'INR', defaultReminderDays: 3 });
  });

  it('the phone app returns from Google to Settings', () => {
    expect(pathForDeepLink('app.zaroori://drive-callback?code=abc&state=s.t')).toBe('/app/settings?drive=1&code=abc&state=s.t');
  });
});
