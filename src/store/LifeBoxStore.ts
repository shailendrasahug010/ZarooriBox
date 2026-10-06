import type {
  Attachment,
  CollectionName,
  CollectionRecord,
  ID,
  Lending,
  Memory,
  MemoryStatus,
  Person,
  RecurringItem,
  Reminder,
  ShoppingItem,
  User,
  UserData,
  UserSettings,
} from '../types';
import type { Repository } from '../data/repository';
import { EMPTY_DATA } from '../data/repository';
import { buildSeed, defaultSettings, deviceTimezone } from '../data/seed';
import { addDays, diffDays, formatDate, nextOccurrenceAfter, todayISO } from '../lib/dates';
import { capitalizeName, formatMoney, nowStamp, uid } from '../lib/format';
import { can, limit } from '../lib/plans';
import type { ParsedQuickAdd } from '../lib/parser';
import { collectDueReminders, toNotification, type DueReminder } from '../lib/notifications/scheduler';
import { hasErrors, validateLending, validateMemory, type LendingInput, type MemoryInput } from './memoryInput';

export class ValidationError extends Error {
  constructor(public fields: Record<string, string | undefined>) {
    super(Object.values(fields).find(Boolean) ?? 'Please check the form.');
    this.name = 'ValidationError';
  }
}

/** Everything needed to put a memory back exactly as it was (for Undo). */
export interface MemorySnapshot {
  memory: Memory;
  reminders: Reminder[];
  recurrences: RecurringItem[];
  attachments: Attachment[];
}

export type CompleteResult = { kind: 'completed' } | { kind: 'rolled'; nextDue: string };

export interface QuickAddResult {
  kind: ParsedQuickAdd['kind'];
  message: string;
  id?: ID;
}

const clean = (s?: string) => {
  const t = s?.trim();
  return t ? t : undefined;
};

/**
 * Framework-free state container for one signed-in user. React subscribes to
 * it; tests drive it directly. Writes are optimistic and roll back on failure.
 */
export class LifeBoxStore {
  private data: UserData = structuredClone(EMPTY_DATA);
  private listeners = new Set<() => void>();
  private readonly repo: Repository;
  readonly user: User;

  constructor(repo: Repository, user: User) {
    this.repo = repo;
    this.user = user;
  }

  get mode() {
    return this.repo.mode;
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = () => this.data;

  private set(next: UserData) {
    this.data = next;
    this.listeners.forEach((l) => l());
  }

  private async mutate(apply: (d: UserData) => UserData, persist: () => Promise<void>) {
    const prev = this.data;
    this.set(apply(prev));
    try {
      await persist();
    } catch (e) {
      this.set(prev);
      throw e;
    }
  }

  private get uid() {
    return this.user.id;
  }

  get settings(): UserSettings {
    return this.data.settings ?? defaultSettings(this.uid);
  }

  // ---------- Lifecycle ----------

  async init() {
    let data = await this.repo.load();
    if (!data.settings) {
      if (this.user.isDemo) {
        data = buildSeed(this.uid);
        await this.persistAll(data);
      } else {
        data.settings = defaultSettings(this.uid);
        await this.repo.saveSettings(data.settings);
      }
    }
    this.set(data);
    // Keep the timezone current (people travel), so server reminders arrive at their local time.
    const tz = deviceTimezone();
    if (this.mode === 'supabase' && this.data.settings && this.data.settings.timezone !== tz) {
      await this.updateSettings({ timezone: tz }).catch(() => {});
    }
  }

  private async persistAll(data: UserData) {
    const order: CollectionName[] = ['people', 'memories', 'reminders', 'recurrences', 'lendings', 'shopping', 'notifications', 'attachments'];
    for (const c of order) await this.repo.insert(c, data[c] as CollectionRecord<typeof c>[]);
    if (data.settings) await this.repo.saveSettings(data.settings);
  }

  async resetDemoData() {
    await this.repo.clearAll();
    const seed = buildSeed(this.uid);
    await this.persistAll(seed);
    this.set(seed);
  }

  async deleteAllData() {
    await this.repo.clearAll();
    const settings = defaultSettings(this.uid);
    await this.repo.saveSettings(settings);
    this.set({ ...structuredClone(EMPTY_DATA), settings });
  }

  exportJSON(): string {
    const strip = this.data.attachments.map(({ dataUrl: _d, ...a }) => {
      void _d;
      return a;
    });
    return JSON.stringify({ exportedAt: nowStamp(), user: { name: this.user.name, email: this.user.email }, ...this.data, attachments: strip }, null, 2);
  }

  // ---------- People ----------

  private async ensurePerson(name: string): Promise<Person> {
    const n = capitalizeName(name);
    const existing = this.data.people.find((p) => p.name.toLowerCase() === n.toLowerCase());
    if (existing) return existing;
    const person: Person = { id: uid('per'), userId: this.uid, name: n, createdAt: nowStamp() };
    await this.mutate(
      (d) => ({ ...d, people: [...d.people, person] }),
      () => this.repo.insert('people', [person]),
    );
    return person;
  }

  // ---------- Memories ----------

  private reminderFor(memoryId: ID, input: MemoryInput, existing?: Reminder): Reminder | null {
    const r = input.reminder;
    if (r.mode === 'none') return null;
    if (r.mode === 'offset') {
      if (!input.dueDate) return null;
      return {
        id: existing?.id ?? uid('rem'),
        userId: this.uid,
        memoryId,
        offsetDays: r.offsetDays,
        remindOn: addDays(input.dueDate, -r.offsetDays),
        notifiedFor: existing?.remindOn === addDays(input.dueDate, -r.offsetDays) ? existing.notifiedFor ?? null : null,
      };
    }
    return {
      id: existing?.id ?? uid('rem'),
      userId: this.uid,
      memoryId,
      // Keep the gap so it moves with the due date when a repeat rolls forward.
      offsetDays: input.dueDate ? diffDays(r.date, input.dueDate) : null,
      remindOn: r.date,
      notifiedFor: existing?.remindOn === r.date ? existing.notifiedFor ?? null : null,
    };
  }

  private recurrenceFor(memoryId: ID, input: MemoryInput, existing?: RecurringItem): RecurringItem | null {
    if (input.repeat.frequency === 'never') return null;
    return {
      id: existing?.id ?? uid('rec'),
      userId: this.uid,
      memoryId,
      frequency: input.repeat.frequency,
      interval: input.repeat.interval,
      unit: input.repeat.unit,
      createdAt: existing?.createdAt ?? nowStamp(),
    };
  }

  private checkLimits(input: MemoryInput, editingId?: ID) {
    const plan = this.settings.plan;
    if (!editingId && this.data.memories.length >= limit(plan, 'memories')) {
      throw new Error('You’ve reached the memory limit on the Free plan.');
    }
    const wasRecurring = editingId ? this.data.recurrences.some((r) => r.memoryId === editingId) : false;
    if (input.repeat.frequency !== 'never' && !wasRecurring && this.data.recurrences.length >= limit(plan, 'recurring')) {
      throw new Error('You’ve reached the recurring item limit on the Free plan.');
    }
    if (input.newFiles?.length && !can(plan, 'attachments')) {
      throw new Error('Attachments are part of LifeBox Pro.');
    }
  }

  private async storeFiles(memoryId: ID, files: File[] = []): Promise<Attachment[]> {
    const out: Attachment[] = [];
    for (const f of files) {
      const base: Attachment = { id: uid('att'), userId: this.uid, memoryId, name: f.name, mimeType: f.type || 'application/octet-stream', size: f.size, createdAt: nowStamp() };
      out.push(await this.repo.storeFile(f, base));
    }
    return out;
  }

  async addMemory(input: MemoryInput): Promise<Memory> {
    const errors = validateMemory(input);
    if (hasErrors(errors)) throw new ValidationError(errors);
    this.checkLimits(input);
    const id = uid('mem');
    const person = clean(input.personName) ? await this.ensurePerson(input.personName!) : null;
    const attachments = await this.storeFiles(id, input.newFiles);
    const stamp = nowStamp();
    const memory: Memory = {
      id,
      userId: this.uid,
      title: input.title.trim(),
      description: clean(input.description),
      categoryId: input.categoryId,
      subcategory: clean(input.subcategory),
      dueDate: input.dueDate || null,
      status: input.status,
      amount: input.amount ?? null,
      currency: this.settings.currency,
      personId: person?.id ?? null,
      location: clean(input.location),
      notes: clean(input.notes),
      source: input.source ?? 'manual',
      createdAt: stamp,
      updatedAt: stamp,
      completedAt: input.status === 'completed' ? stamp : null,
    };
    const reminder = this.reminderFor(id, input);
    const recurrence = this.recurrenceFor(id, input);
    await this.mutate(
      (d) => ({
        ...d,
        memories: [...d.memories, memory],
        reminders: reminder ? [...d.reminders, reminder] : d.reminders,
        recurrences: recurrence ? [...d.recurrences, recurrence] : d.recurrences,
        attachments: [...d.attachments, ...attachments],
      }),
      async () => {
        await this.repo.insert('memories', [memory]);
        if (reminder) await this.repo.insert('reminders', [reminder]);
        if (recurrence) await this.repo.insert('recurrences', [recurrence]);
        if (attachments.length) await this.repo.insert('attachments', attachments);
      },
    );
    return memory;
  }

  async updateMemory(id: ID, input: MemoryInput): Promise<void> {
    const current = this.data.memories.find((m) => m.id === id);
    if (!current) throw new Error('That item no longer exists.');
    const errors = validateMemory(input);
    if (hasErrors(errors)) throw new ValidationError(errors);
    this.checkLimits(input, id);
    const person = clean(input.personName) ? await this.ensurePerson(input.personName!) : null;
    const added = await this.storeFiles(id, input.newFiles);
    const removeIds = new Set(input.removeAttachmentIds ?? []);
    const oldReminder = this.data.reminders.find((r) => r.memoryId === id);
    const oldRecurrence = this.data.recurrences.find((r) => r.memoryId === id);
    const reminder = this.reminderFor(id, input, oldReminder);
    const recurrence = this.recurrenceFor(id, input, oldRecurrence);
    const stamp = nowStamp();
    const patch: Partial<Memory> = {
      title: input.title.trim(),
      description: clean(input.description) ?? '',
      categoryId: input.categoryId,
      subcategory: clean(input.subcategory) ?? '',
      dueDate: input.dueDate || null,
      status: input.status,
      amount: input.amount ?? null,
      personId: person?.id ?? null,
      location: clean(input.location) ?? '',
      notes: clean(input.notes) ?? '',
      updatedAt: stamp,
      completedAt: input.status === 'completed' ? current.completedAt ?? stamp : null,
    };
    await this.mutate(
      (d) => ({
        ...d,
        memories: d.memories.map((m) => (m.id === id ? { ...m, ...patch } : m)),
        reminders: [...d.reminders.filter((r) => r.memoryId !== id), ...(reminder ? [reminder] : [])],
        recurrences: [...d.recurrences.filter((r) => r.memoryId !== id), ...(recurrence ? [recurrence] : [])],
        attachments: [...d.attachments.filter((a) => !removeIds.has(a.id)), ...added],
      }),
      async () => {
        await this.repo.update('memories', id, patch);
        if (oldReminder && !reminder) await this.repo.remove('reminders', [oldReminder.id]);
        if (reminder) oldReminder ? await this.repo.update('reminders', reminder.id, reminder) : await this.repo.insert('reminders', [reminder]);
        if (oldRecurrence && !recurrence) await this.repo.remove('recurrences', [oldRecurrence.id]);
        if (recurrence) oldRecurrence ? await this.repo.update('recurrences', recurrence.id, recurrence) : await this.repo.insert('recurrences', [recurrence]);
        if (removeIds.size) await this.repo.remove('attachments', [...removeIds]);
        if (added.length) await this.repo.insert('attachments', added);
      },
    );
  }

  snapshot(id: ID): MemorySnapshot | null {
    const memory = this.data.memories.find((m) => m.id === id);
    if (!memory) return null;
    return {
      memory: { ...memory },
      reminders: this.data.reminders.filter((r) => r.memoryId === id).map((r) => ({ ...r })),
      recurrences: this.data.recurrences.filter((r) => r.memoryId === id).map((r) => ({ ...r })),
      attachments: this.data.attachments.filter((a) => a.memoryId === id).map((a) => ({ ...a })),
    };
  }

  /** Puts a memory back as it was in the snapshot (Undo for complete/delete/archive). */
  async restore(snap: MemorySnapshot) {
    const id = snap.memory.id;
    const exists = this.data.memories.some((m) => m.id === id);
    const before = { r: this.data.reminders.filter((r) => r.memoryId === id), c: this.data.recurrences.filter((r) => r.memoryId === id) };
    await this.mutate(
      (d) => ({
        ...d,
        memories: exists ? d.memories.map((m) => (m.id === id ? snap.memory : m)) : [...d.memories, snap.memory],
        reminders: [...d.reminders.filter((r) => r.memoryId !== id), ...snap.reminders],
        recurrences: [...d.recurrences.filter((r) => r.memoryId !== id), ...snap.recurrences],
        attachments: exists ? d.attachments : [...d.attachments, ...snap.attachments],
      }),
      async () => {
        if (exists) {
          await this.repo.update('memories', id, snap.memory);
          if (before.r.length) await this.repo.remove('reminders', before.r.map((r) => r.id));
          if (before.c.length) await this.repo.remove('recurrences', before.c.map((r) => r.id));
        } else {
          await this.repo.insert('memories', [snap.memory]);
          if (snap.attachments.length) await this.repo.insert('attachments', snap.attachments);
        }
        if (snap.reminders.length) await this.repo.insert('reminders', snap.reminders);
        if (snap.recurrences.length) await this.repo.insert('recurrences', snap.recurrences);
      },
    );
  }

  /**
   * Marks something done. Repeating items roll forward to their next date
   * instead of disappearing, which is what "RO filter every 6 months" needs.
   */
  async completeMemory(id: ID): Promise<CompleteResult> {
    const m = this.data.memories.find((x) => x.id === id);
    if (!m) throw new Error('That item no longer exists.');
    const rec = this.data.recurrences.find((r) => r.memoryId === id);
    const stamp = nowStamp();
    if (rec && m.dueDate && m.status === 'active') {
      const nextDue = nextOccurrenceAfter(m.dueDate, rec, todayISO());
      const rem = this.data.reminders.find((r) => r.memoryId === id);
      const remPatch: Partial<Reminder> | null = rem
        ? { remindOn: rem.offsetDays != null ? addDays(nextDue, -rem.offsetDays) : rem.remindOn, notifiedFor: null }
        : null;
      const patch: Partial<Memory> = { dueDate: nextDue, lastCompletedAt: stamp, updatedAt: stamp };
      await this.mutate(
        (d) => ({
          ...d,
          memories: d.memories.map((x) => (x.id === id ? { ...x, ...patch } : x)),
          reminders: d.reminders.map((r) => (rem && r.id === rem.id ? { ...r, ...remPatch } : r)),
        }),
        async () => {
          await this.repo.update('memories', id, patch);
          if (rem && remPatch) await this.repo.update('reminders', rem.id, remPatch);
        },
      );
      return { kind: 'rolled', nextDue };
    }
    await this.setStatus(id, 'completed');
    return { kind: 'completed' };
  }

  async setStatus(id: ID, status: MemoryStatus) {
    const stamp = nowStamp();
    const patch: Partial<Memory> = { status, updatedAt: stamp, completedAt: status === 'completed' ? stamp : null };
    await this.mutate(
      (d) => ({ ...d, memories: d.memories.map((m) => (m.id === id ? { ...m, ...patch } : m)) }),
      () => this.repo.update('memories', id, patch),
    );
  }

  async deleteMemory(id: ID): Promise<MemorySnapshot | null> {
    const snap = this.snapshot(id);
    if (!snap) return null;
    await this.mutate(
      (d) => ({
        ...d,
        memories: d.memories.filter((m) => m.id !== id),
        reminders: d.reminders.filter((r) => r.memoryId !== id),
        recurrences: d.recurrences.filter((r) => r.memoryId !== id),
        attachments: d.attachments.filter((a) => a.memoryId !== id),
        notifications: d.notifications.map((n) => (n.memoryId === id ? { ...n, memoryId: null } : n)),
      }),
      async () => {
        if (snap.reminders.length) await this.repo.remove('reminders', snap.reminders.map((r) => r.id));
        if (snap.recurrences.length) await this.repo.remove('recurrences', snap.recurrences.map((r) => r.id));
        // Undo re-inserts attachments from the snapshot, so only rows go here.
        if (snap.attachments.length) await this.repo.remove('attachments', snap.attachments.map((a) => a.id));
        await this.repo.remove('memories', [id]);
      },
    );
    return snap;
  }

  // ---------- Lending ----------

  async addLending(input: LendingInput): Promise<Lending> {
    const errors = validateLending(input);
    if (hasErrors(errors)) throw new ValidationError(errors);
    const person = await this.ensurePerson(input.personName);
    const stamp = nowStamp();
    const l: Lending = {
      id: uid('len'),
      userId: this.uid,
      personId: person.id,
      direction: input.direction,
      kind: input.kind,
      amount: input.kind === 'money' ? input.amount ?? null : null,
      currency: this.settings.currency,
      itemName: input.kind === 'thing' ? clean(input.itemName) : undefined,
      date: input.date,
      followUpDate: input.followUpDate || null,
      status: 'open',
      notes: clean(input.notes),
      createdAt: stamp,
      updatedAt: stamp,
    };
    await this.mutate(
      (d) => ({ ...d, lendings: [...d.lendings, l] }),
      () => this.repo.insert('lendings', [l]),
    );
    return l;
  }

  async updateLending(id: ID, input: LendingInput) {
    const errors = validateLending(input);
    if (hasErrors(errors)) throw new ValidationError(errors);
    const person = await this.ensurePerson(input.personName);
    const patch: Partial<Lending> = {
      personId: person.id,
      direction: input.direction,
      kind: input.kind,
      amount: input.kind === 'money' ? input.amount ?? null : null,
      itemName: input.kind === 'thing' ? clean(input.itemName) ?? '' : '',
      date: input.date,
      followUpDate: input.followUpDate || null,
      notes: clean(input.notes) ?? '',
      updatedAt: nowStamp(),
    };
    await this.patchLending(id, patch);
  }

  private async patchLending(id: ID, patch: Partial<Lending>) {
    await this.mutate(
      (d) => ({ ...d, lendings: d.lendings.map((l) => (l.id === id ? { ...l, ...patch } : l)) }),
      () => this.repo.update('lendings', id, patch),
    );
  }

  async setLendingReturned(id: ID, returned: boolean) {
    const stamp = nowStamp();
    await this.patchLending(id, { status: returned ? 'returned' : 'open', returnedAt: returned ? stamp : null, updatedAt: stamp });
  }

  async markLendingReminded(id: ID) {
    await this.patchLending(id, { lastReminderAt: nowStamp() });
  }

  async deleteLending(id: ID): Promise<Lending | null> {
    const l = this.data.lendings.find((x) => x.id === id) ?? null;
    if (!l) return null;
    await this.mutate(
      (d) => ({ ...d, lendings: d.lendings.filter((x) => x.id !== id) }),
      () => this.repo.remove('lendings', [id]),
    );
    return l;
  }

  async restoreLending(l: Lending) {
    await this.mutate(
      (d) => ({ ...d, lendings: [...d.lendings, l] }),
      () => this.repo.insert('lendings', [l]),
    );
  }

  /** A friendly message to send the other person. */
  reminderMessage(l: Lending): string {
    const name = this.data.people.find((p) => p.id === l.personId)?.name ?? 'there';
    const what = l.kind === 'money' ? formatMoney(l.amount, l.currency) : `the ${l.itemName?.toLowerCase() ?? 'item'}`;
    return l.direction === 'lent'
      ? `Hi ${name}! Just a gentle reminder about ${what} from ${formatDate(l.date)}. No rush, whenever it’s convenient 🙂`
      : `Hi ${name}! I haven’t forgotten ${what} I borrowed on ${formatDate(l.date)}. Will return it soon 🙏`;
  }

  // ---------- Shopping ----------

  async addShoppingItems(items: { name: string; quantity?: string; listCategory: string }[]): Promise<ShoppingItem[]> {
    const rows: ShoppingItem[] = items
      .map((i) => ({ ...i, name: i.name.trim() }))
      .filter((i) => i.name && i.name.length <= 120)
      .map((i) => ({
        id: uid('shp'),
        userId: this.uid,
        name: i.name.charAt(0).toUpperCase() + i.name.slice(1),
        quantity: clean(i.quantity)?.slice(0, 30),
        listCategory: i.listCategory || 'Grocery',
        purchased: false,
        createdAt: nowStamp(),
      }));
    if (!rows.length) throw new ValidationError({ name: 'What do you need to buy?' });
    await this.mutate(
      (d) => ({ ...d, shopping: [...d.shopping, ...rows] }),
      () => this.repo.insert('shopping', rows),
    );
    return rows;
  }

  async updateShoppingItem(id: ID, patch: Partial<Pick<ShoppingItem, 'name' | 'quantity' | 'listCategory'>>) {
    await this.mutate(
      (d) => ({ ...d, shopping: d.shopping.map((s) => (s.id === id ? { ...s, ...patch } : s)) }),
      () => this.repo.update('shopping', id, patch),
    );
  }

  async toggleShopping(id: ID) {
    const item = this.data.shopping.find((s) => s.id === id);
    if (!item) return;
    const patch: Partial<ShoppingItem> = { purchased: !item.purchased, purchasedAt: item.purchased ? null : nowStamp() };
    await this.mutate(
      (d) => ({ ...d, shopping: d.shopping.map((s) => (s.id === id ? { ...s, ...patch } : s)) }),
      () => this.repo.update('shopping', id, patch),
    );
  }

  async deleteShopping(ids: ID[]): Promise<ShoppingItem[]> {
    const set = new Set(ids);
    const removed = this.data.shopping.filter((s) => set.has(s.id));
    await this.mutate(
      (d) => ({ ...d, shopping: d.shopping.filter((s) => !set.has(s.id)) }),
      () => this.repo.remove('shopping', ids),
    );
    return removed;
  }

  async restoreShopping(items: ShoppingItem[]) {
    await this.mutate(
      (d) => ({ ...d, shopping: [...d.shopping, ...items] }),
      () => this.repo.insert('shopping', items),
    );
  }

  async clearPurchased() {
    return this.deleteShopping(this.data.shopping.filter((s) => s.purchased).map((s) => s.id));
  }

  // ---------- Quick Add ----------

  async applyQuickAdd(p: ParsedQuickAdd): Promise<QuickAddResult> {
    if (p.kind === 'shopping' && p.shoppingItems?.length) {
      const rows = await this.addShoppingItems(p.shoppingItems);
      return { kind: 'shopping', message: rows.length === 1 ? `${rows[0].name} added to shopping` : `${rows.length} items added to shopping` };
    }
    if (p.kind === 'lending' && p.person && p.direction && p.lendingKind) {
      const l = await this.addLending({
        personName: p.person,
        direction: p.direction,
        kind: p.lendingKind,
        amount: p.amount,
        itemName: p.thing,
        date: p.dueDate ?? todayISO(),
        followUpDate: p.followUpDate ?? null,
      });
      return { kind: 'lending', message: `Saved: ${p.title}`, id: l.id };
    }
    const m = await this.addMemory({
      title: p.title,
      categoryId: p.categoryId === 'shopping' || p.categoryId === 'people' ? 'personal' : p.categoryId,
      subcategory: p.subcategory,
      dueDate: p.dueDate,
      reminder: p.dueDate && p.reminderDaysBefore != null ? { mode: 'offset', offsetDays: p.reminderDaysBefore } : { mode: 'none' },
      repeat: p.repeat,
      status: 'active',
      amount: p.amount,
      source: 'quick_add',
    });
    return { kind: 'memory', message: `Remembered: ${m.title}`, id: m.id };
  }

  // ---------- Notifications & settings ----------

  /** Turns due reminders into in-app notifications. Returns the ones just created. */
  async runReminderCheck(today = todayISO()): Promise<DueReminder[]> {
    const due = collectDueReminders(this.data, today);
    if (!due.length) return [];
    const notes = due.map((d) => toNotification(d, this.uid, uid('ntf')));
    const reminderIds = new Map(due.filter((d) => d.reminder).map((d) => [d.reminder!.id, d.dueDate]));
    const lendingIds = new Set(due.filter((d) => d.lendingId).map((d) => d.lendingId!));
    const stamp = nowStamp();
    await this.mutate(
      (d) => ({
        ...d,
        notifications: [...notes, ...d.notifications].slice(0, 100),
        reminders: d.reminders.map((r) => (reminderIds.has(r.id) ? { ...r, notifiedFor: reminderIds.get(r.id)! } : r)),
        lendings: d.lendings.map((l) => (lendingIds.has(l.id) ? { ...l, lastReminderAt: stamp } : l)),
      }),
      async () => {
        await this.repo.insert('notifications', notes);
        for (const [id, dueDate] of reminderIds) await this.repo.update('reminders', id, { notifiedFor: dueDate });
        for (const id of lendingIds) await this.repo.update('lendings', id, { lastReminderAt: stamp });
      },
    );
    return due;
  }

  async markNotificationsRead(ids?: ID[]) {
    const stamp = nowStamp();
    const target = new Set(ids ?? this.data.notifications.filter((n) => !n.readAt).map((n) => n.id));
    if (!target.size) return;
    await this.mutate(
      (d) => ({ ...d, notifications: d.notifications.map((n) => (target.has(n.id) ? { ...n, readAt: stamp } : n)) }),
      async () => {
        for (const id of target) await this.repo.update('notifications', id, { readAt: stamp });
      },
    );
  }

  async clearNotifications() {
    const ids = this.data.notifications.map((n) => n.id);
    await this.mutate(
      (d) => ({ ...d, notifications: [] }),
      () => this.repo.remove('notifications', ids),
    );
  }

  async updateSettings(patch: Partial<Omit<UserSettings, 'userId'>>) {
    const next: UserSettings = { ...this.settings, ...patch, userId: this.uid, updatedAt: nowStamp() };
    await this.mutate(
      (d) => ({ ...d, settings: next }),
      () => this.repo.saveSettings(next),
    );
  }
}
