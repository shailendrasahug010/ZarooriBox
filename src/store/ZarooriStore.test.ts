import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocalRepository, dataKey, memoryStore, type KeyValueStore } from '../data/localRepository';
import { AccessDeniedError } from '../data/repository';
import { addDays, REPEAT_PRESETS, setNow } from '../lib/dates';
import { parseQuickAdd } from '../lib/parser';
import { buildMemoryViews, dueToday } from '../lib/selectors';
import { searchAll } from '../lib/search';
import { buildLendingViews } from '../lib/selectors';
import type { User } from '../types';
import { ZarooriStore, ValidationError } from './ZarooriStore';
import type { MemoryInput } from './memoryInput';

const TODAY = '2026-10-06';
const alice: User = { id: 'usr_alice', email: 'a@x.com', name: 'Alice', createdAt: '' };
const bob: User = { id: 'usr_bob', email: 'b@x.com', name: 'Bob', createdAt: '' };

let kv: KeyValueStore;
let store: ZarooriStore;

const input = (over: Partial<MemoryInput> = {}): MemoryInput => ({
  title: 'Car insurance',
  categoryId: 'vehicle',
  subcategory: 'Insurance',
  dueDate: '2026-11-20',
  reminder: { mode: 'offset', offsetDays: 30 },
  repeat: { ...REPEAT_PRESETS.never },
  status: 'active',
  ...over,
});

beforeEach(async () => {
  setNow(new Date(2026, 9, 6, 9, 0));
  kv = memoryStore();
  store = new ZarooriStore(createLocalRepository(alice.id, kv), alice);
  await store.init();
});
afterEach(() => setNow(null));

/** A second store over the same storage proves writes were persisted. */
async function reload(user = alice) {
  const s = new ZarooriStore(createLocalRepository(user.id, kv), user);
  await s.init();
  return s.getSnapshot();
}

describe('memories', () => {
  it('creates with reminder and persists', async () => {
    const m = await store.addMemory(input());
    const d = await reload();
    expect(d.memories.map((x) => x.title)).toEqual(['Car insurance']);
    expect(d.reminders[0]).toMatchObject({ memoryId: m.id, offsetDays: 30, remindOn: '2026-10-21' });
  });

  it('validates input', async () => {
    await expect(store.addMemory(input({ title: '  ' }))).rejects.toBeInstanceOf(ValidationError);
    await expect(store.addMemory(input({ dueDate: null, reminder: { mode: 'none' }, repeat: { ...REPEAT_PRESETS.monthly } }))).rejects.toThrow(/first due date/);
    await expect(store.addMemory(input({ reminder: { mode: 'date', date: '2026-12-01' } }))).rejects.toThrow(/before the due date/);
    expect(store.getSnapshot().memories).toHaveLength(0);
  });

  it('edits fields, reminder and repeat', async () => {
    const m = await store.addMemory(input());
    await store.updateMemory(m.id, input({ title: 'Car insurance (ICICI)', dueDate: '2026-12-01', reminder: { mode: 'offset', offsetDays: 7 }, repeat: { ...REPEAT_PRESETS.yearly } }));
    const d = await reload();
    expect(d.memories[0].title).toBe('Car insurance (ICICI)');
    expect(d.reminders).toHaveLength(1);
    expect(d.reminders[0].remindOn).toBe('2026-11-24');
    expect(d.recurrences[0].frequency).toBe('yearly');
    await store.updateMemory(m.id, input({ reminder: { mode: 'none' } }));
    expect((await reload()).reminders).toHaveLength(0);
    expect((await reload()).recurrences).toHaveLength(0);
  });

  it('deletes with cascade and undo', async () => {
    const m = await store.addMemory(input({ repeat: { ...REPEAT_PRESETS.yearly } }));
    const snap = await store.deleteMemory(m.id);
    let d = await reload();
    expect(d.memories).toHaveLength(0);
    expect(d.reminders).toHaveLength(0);
    expect(d.recurrences).toHaveLength(0);
    await store.restore(snap!);
    d = await reload();
    expect(d.memories).toHaveLength(1);
    expect(d.reminders).toHaveLength(1);
    expect(d.recurrences).toHaveLength(1);
  });

  it('completes one-off items', async () => {
    const m = await store.addMemory(input());
    expect(await store.completeMemory(m.id)).toEqual({ kind: 'completed' });
    expect((await reload()).memories[0].status).toBe('completed');
  });

  it('rolls recurring items forward, past today', async () => {
    const m = await store.addMemory(input({ title: 'Electricity bill', dueDate: '2026-08-10', reminder: { mode: 'offset', offsetDays: 2 }, repeat: { ...REPEAT_PRESETS.monthly } }));
    const r = await store.completeMemory(m.id);
    expect(r).toEqual({ kind: 'rolled', nextDue: '2026-10-10' });
    const d = await reload();
    expect(d.memories[0]).toMatchObject({ status: 'active', dueDate: '2026-10-10' });
    expect(d.reminders[0].remindOn).toBe('2026-10-08');
  });

  it('archives and restores status', async () => {
    const m = await store.addMemory(input());
    await store.setStatus(m.id, 'archived');
    expect((await reload()).memories[0].status).toBe('archived');
    await store.setStatus(m.id, 'active');
    expect((await reload()).memories[0].status).toBe('active');
  });
});

describe('quick add end to end', () => {
  const ctx = { today: TODAY, currency: 'INR' };
  it('memory, lending and shopping', async () => {
    await store.applyQuickAdd(parseQuickAdd('Bike insurance expires on 17 November', ctx));
    await store.applyQuickAdd(parseQuickAdd('I lent Rahul ₹2000 today', ctx));
    await store.applyQuickAdd(parseQuickAdd('Buy milk and bread', ctx));
    const d = await reload();
    expect(d.memories[0]).toMatchObject({ title: 'Bike Insurance', dueDate: '2026-11-17', source: 'quick_add' });
    expect(d.reminders[0].remindOn).toBe('2026-10-18');
    expect(d.lendings[0]).toMatchObject({ amount: 2000, direction: 'lent', date: TODAY });
    expect(d.people.map((p) => p.name)).toEqual(['Rahul']);
    expect(d.shopping.map((s) => s.name)).toEqual(['Milk', 'Bread']);
  });
});

describe('lending', () => {
  it('add, return, delete', async () => {
    const l = await store.addLending({ personName: 'amit', direction: 'borrowed', kind: 'thing', itemName: 'Drill', date: TODAY, followUpDate: addDays(TODAY, 7) });
    await store.setLendingReturned(l.id, true);
    let d = await reload();
    expect(d.lendings[0].status).toBe('returned');
    expect(d.people[0].name).toBe('Amit');
    await store.deleteLending(l.id);
    d = await reload();
    expect(d.lendings).toHaveLength(0);
  });

  it('reuses people case-insensitively', async () => {
    await store.addLending({ personName: 'Rahul', direction: 'lent', kind: 'money', amount: 100, date: TODAY });
    await store.addLending({ personName: 'rahul', direction: 'lent', kind: 'money', amount: 200, date: TODAY });
    expect(store.getSnapshot().people).toHaveLength(1);
  });

  it('validates', async () => {
    await expect(store.addLending({ personName: '', direction: 'lent', kind: 'money', amount: 5, date: TODAY })).rejects.toThrow();
    await expect(store.addLending({ personName: 'X', direction: 'lent', kind: 'money', amount: 0, date: TODAY })).rejects.toThrow();
  });
});

describe('shopping', () => {
  it('add, purchase, clear', async () => {
    await store.addShoppingItems([{ name: 'milk', listCategory: 'Grocery', quantity: '2 L' }, { name: 'Bulb', listCategory: 'Home' }]);
    const milk = store.getSnapshot().shopping[0];
    await store.toggleShopping(milk.id);
    await store.clearPurchased();
    const d = await reload();
    expect(d.shopping.map((s) => s.name)).toEqual(['Bulb']);
  });
});

describe('reminders', () => {
  it('fires once per due date', async () => {
    await store.addMemory(input({ dueDate: '2026-10-20', reminder: { mode: 'offset', offsetDays: 30 } }));
    await store.addMemory(input({ title: 'Later', dueDate: '2027-10-20' }));
    expect(await store.runReminderCheck(TODAY)).toHaveLength(1);
    expect(await store.runReminderCheck(TODAY)).toHaveLength(0);
    expect((await reload()).notifications).toHaveLength(1);
  });
});

describe('demo + search', () => {
  it('seeds demo data and finds insurance', async () => {
    const demo: User = { ...alice, id: 'usr_demo', isDemo: true };
    const s = new ZarooriStore(createLocalRepository(demo.id, kv), demo);
    await s.init();
    const d = s.getSnapshot();
    expect(d.memories.length).toBeGreaterThan(10);
    const views = buildMemoryViews(d);
    expect(dueToday(views).map((m) => m.title)).toContain('Electricity Bill');
    const r = searchAll('insurance', views, buildLendingViews(d), d.shopping);
    expect(r.memories.map((m) => m.title)).toEqual(expect.arrayContaining(['Car Insurance', 'Health Insurance Premium']));
  });
});

describe('data isolation', () => {
  it('a user never sees or writes another user’s rows', async () => {
    const m = await store.addMemory(input());
    const bobRepo = createLocalRepository(bob.id, kv);
    const bobStore = new ZarooriStore(bobRepo, bob);
    await bobStore.init();
    expect(bobStore.getSnapshot().memories).toHaveLength(0);
    // Bob cannot update or insert Alice's rows through his repository.
    await expect(bobRepo.update('memories', m.id, { title: 'hacked' })).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(bobRepo.insert('memories', [{ ...store.getSnapshot().memories[0], id: 'x' }])).rejects.toBeInstanceOf(AccessDeniedError);
    // Even tampered storage is filtered on read.
    const raw = JSON.parse(kv.getItem(dataKey(alice.id))!);
    kv.setItem(dataKey(bob.id), JSON.stringify(raw));
    expect((await bobRepo.load()).memories).toHaveLength(0);
    expect((await reload()).memories[0].title).toBe('Car insurance');
  });
});

describe('quick actions', () => {
  it('snoozes a memory to tomorrow and clears the sent mark', async () => {
    const m = await store.addMemory(input({ dueDate: TODAY, reminder: { mode: 'offset', offsetDays: 0 } }));
    const msg = await store.act({ kind: 'memory', id: m.id }, 'tomorrow');
    expect(msg).toMatch(/tomorrow/i);
    const r = (await reload()).reminders.find((x) => x.memoryId === m.id)!;
    expect(r.remindOn).toBe(addDays(TODAY, 1));
    expect(r.notifiedFor).toBeNull();
  });

  it('adds a reminder when snoozing an item without one', async () => {
    const m = await store.addMemory(input({ reminder: { mode: 'none' } }));
    await store.act({ kind: 'memory', id: m.id }, 'week');
    expect((await reload()).reminders.find((x) => x.memoryId === m.id)?.remindOn).toBe(addDays(TODAY, 7));
  });

  it('marks done once, then reports it was already done', async () => {
    const m = await store.addMemory(input());
    await store.act({ kind: 'memory', id: m.id }, 'done');
    expect((await reload()).memories[0].status).toBe('completed');
    expect(await store.act({ kind: 'memory', id: m.id }, 'done')).toMatch(/already/i);
  });

  it('settles or snoozes a lending', async () => {
    const l = await store.addLending({ personName: 'Amit', direction: 'lent', kind: 'money', amount: 500, date: TODAY, followUpDate: TODAY });
    await store.act({ kind: 'lending', id: l.id }, 'tomorrow');
    expect((await reload()).lendings[0].followUpDate).toBe(addDays(TODAY, 1));
    await store.act({ kind: 'lending', id: l.id }, 'done');
    expect((await reload()).lendings[0].status).not.toBe('open');
  });

  it('remembers onboarding and language', async () => {
    await store.finishOnboarding();
    await store.setLanguage('hi');
    const s = (await reload()).settings!;
    expect(s.onboardedAt).toBeTruthy();
    expect(s.language).toBe('hi');
    await store.setLanguage('en');
  });

  it('keeps family sharing to signed-in cloud accounts', async () => {
    expect(store.canUseFamily).toBe(false);
    await expect(store.joinFamily('AB12CD34')).rejects.toThrow();
  });
});

describe('medicine dose ticks', () => {
  const day = '2026-10-06';

  beforeEach(() => vi.stubGlobal('localStorage', memoryStore()));
  afterEach(() => vi.unstubAllGlobals());

  it('keeps ticks on this device without a cloud account', async () => {
    await store.setDoseTaken(day, 'm1@08:00', true);
    await store.setDoseTaken(day, 'm1@20:00', true);
    await store.setDoseTaken(day, 'm1@20:00', false);
    expect([...(await store.takenDoses(day))]).toEqual(['m1@08:00']);
    expect([...(await store.takenDoses('2026-10-07'))]).toEqual([]);
  });

  it('saves ticks to the account and carries up ticks made on this device', async () => {
    const saved = new Map<string, Set<string>>();
    const doses = {
      taken: async (d: string) => [...(saved.get(d) ?? [])],
      set: async (d: string, k: string, on: boolean) => {
        if (k.startsWith('gone')) throw new Error('memory deleted');
        const s = saved.get(d) ?? new Set<string>();
        if (on) s.add(k);
        else s.delete(k);
        saved.set(d, s);
      },
    };
    // A tick from before the account synced, plus one for a medicine since deleted.
    await store.setDoseTaken(day, 'm1@08:00', true);
    await store.setDoseTaken(day, 'gone@09:00', true);
    const cloud = new ZarooriStore({ ...createLocalRepository(alice.id, kv), doses }, alice);
    await cloud.init();

    expect([...(await cloud.takenDoses(day))]).toEqual(['m1@08:00']);
    await cloud.setDoseTaken(day, 'm1@20:00', true);
    expect([...saved.get(day)!].sort()).toEqual(['m1@08:00', 'm1@20:00']);
    // The local list was handed over, so a second phone sees the same ticks from the account.
    expect(localStorage.getItem(`zaroori:v1:doses:${alice.id}:${day}`)).toBeNull();
    expect([...(await cloud.takenDoses(day))].sort()).toEqual(['m1@08:00', 'm1@20:00']);
  });
});
