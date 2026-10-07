import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocalRepository, memoryStore } from '../data/localRepository';
import { REPEAT_PRESETS, setNow } from './dates';
import { buildMemoryViews, dueToday } from './selectors';
import { todayGroups } from '../pages/Dashboard';
import { widgetLines } from './widget';
import { applyAppearance, readAppearance, saveAppearance } from './appearance';
import { pathForDeepLink } from './appNavigation';
import { ZarooriStore } from '../store/ZarooriStore';
import type { MemoryInput } from '../store/memoryInput';

const TODAY = '2026-10-06';
let store: ZarooriStore;

const input = (over: Partial<MemoryInput> = {}): MemoryInput => ({
  title: 'Item',
  categoryId: 'home',
  dueDate: TODAY,
  reminder: { mode: 'offset', offsetDays: 0 },
  repeat: { ...REPEAT_PRESETS.never },
  status: 'active',
  ...over,
});

beforeEach(async () => {
  setNow(new Date(2026, 9, 6, 9, 0));
  store = new ZarooriStore(createLocalRepository('usr_a', memoryStore()), { id: 'usr_a', email: 'a@x.com', name: 'A', createdAt: '' });
  await store.init();
  for (const m of store.getSnapshot().memories) await store.deleteMemory(m.id);
});
afterEach(() => setNow(null));

async function addSamples() {
  await store.addMemory(input({ title: 'Pay electricity', dueDate: '2026-10-04' }));
  await store.addMemory(input({ title: 'Call plumber', times: ['18:30'] }));
  await store.addMemory(input({ title: 'Walk', times: ['07:00'] }));
  await store.addMemory(input({ title: 'Lunch box', times: ['13:00'] }));
  await store.addMemory(input({ title: 'Water plants' }));
  await store.addMemory(input({ title: 'BP tablet', categoryId: 'health', subcategory: 'Medicines', times: ['08:00', '20:00'], repeat: { ...REPEAT_PRESETS.daily } }));
}

describe('Today on Home, by time of day', () => {
  it('splits into overdue, morning, afternoon, evening and any time', async () => {
    await addSamples();
    const groups = todayGroups(dueToday(buildMemoryViews(store.getSnapshot())));
    expect(groups.map((g) => [g.key, g.items.map((m) => m.title)])).toEqual([
      ['overdue', ['Pay electricity']],
      ['morning', ['Walk']],
      ['afternoon', ['Lunch box']],
      ['evening', ['Call plumber']],
      ['anytime', ['Water plants']],
    ]);
  });
});

describe('home-screen widget list', () => {
  it('lists overdue first, then medicines and reminders by time, then untimed', async () => {
    await addSamples();
    const lines = widgetLines(store.getSnapshot(), TODAY);
    expect(lines.map((l) => `${l.time}|${l.title}`)).toEqual([
      '|Pay electricity',
      '07:00|Walk',
      '08:00|BP tablet',
      '13:00|Lunch box',
      '18:30|Call plumber',
      '20:00|BP tablet',
      '|Water plants',
    ]);
    expect(lines[0].overdue).toBe(true);
    expect(lines[2].medicine).toBe(true);
  });

  it('is empty when nothing is due', () => {
    expect(widgetLines(store.getSnapshot(), TODAY)).toEqual([]);
  });

  it('opens Home from the widget', () => {
    expect(pathForDeepLink('app.zaroori://home')).toBe('/app');
  });
});

describe('text size and dark mode', () => {
  const root = { style: {} as Record<string, string>, dataset: {} as Record<string, string> };
  beforeEach(() => {
    const kv = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => kv.get(k) ?? null, setItem: (k: string, v: string) => kv.set(k, v) });
    vi.stubGlobal('document', { documentElement: root, querySelector: () => null });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('starts normal and follows the phone', () => {
    expect(readAppearance()).toEqual({ textSize: 'normal', theme: 'auto' });
  });

  it('saves and applies a bigger text size and dark colours', () => {
    saveAppearance({ textSize: 'xlarge', theme: 'dark' });
    expect(readAppearance()).toEqual({ textSize: 'xlarge', theme: 'dark' });
    applyAppearance();
    expect(root.style.fontSize).toBe('125%');
    expect(root.dataset.theme).toBe('dark');
  });

  it('ignores a damaged saved value', () => {
    localStorage.setItem('zaroori:v1:appearance', '{"textSize":"huge","theme":7}');
    expect(readAppearance()).toEqual({ textSize: 'normal', theme: 'auto' });
  });
});
