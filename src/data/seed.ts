import type { CategoryId, ID, ISODate, Lending, Memory, Person, RecurringItem, Reminder, RepeatFrequency, ShoppingItem, UserData, UserSettings } from '../types';
import { addDays, REPEAT_PRESETS, todayISO } from '../lib/dates';
import { uid } from '../lib/format';
import { getLanguage } from '../i18n';

export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
  } catch {
    return 'Asia/Kolkata';
  }
}

export function defaultSettings(userId: ID): UserSettings {
  return {
    userId,
    currency: 'INR',
    defaultReminderDays: 1,
    plan: 'free',
    phone: null,
    timezone: deviceTimezone(),
    language: getLanguage(),
    notifications: {
      inApp: true,
      browser: false,
      email: false,
      whatsapp: false,
      sms: false,
      dailyDigest: true,
      digestTime: '08:00',
    },
    updatedAt: new Date().toISOString(),
  };
}

interface SeedMemory {
  title: string;
  categoryId: CategoryId;
  subcategory?: string;
  inDays: number | null;
  remind?: number;
  repeat?: Exclude<RepeatFrequency, 'custom'>;
  amount?: number;
  description?: string;
  location?: string;
  notes?: string;
  status?: Memory['status'];
}

const MEMORIES: SeedMemory[] = [
  { title: 'Electricity Bill', categoryId: 'home', subcategory: 'Bills', inDays: 0, remind: 2, repeat: 'monthly', amount: 1840, description: 'BESCOM — pay via UPI' },
  { title: 'Return Myntra Package', categoryId: 'personal', inDays: 0, remind: 0, description: 'Pickup window closes tonight', notes: 'Shoes didn’t fit. Keep the original box.' },
  { title: 'AC Service', categoryId: 'home', subcategory: 'Services', inDays: 5, remind: 3, repeat: 'half_yearly', location: 'Living room + bedroom', notes: 'Urban Company technician, ask for gas check' },
  { title: 'RO Filter Change', categoryId: 'home', subcategory: 'Maintenance', inDays: 7, remind: 7, repeat: 'half_yearly', amount: 1200, description: 'Kent RO — sediment + carbon filter' },
  { title: 'Car Service', categoryId: 'vehicle', subcategory: 'Service', inDays: 12, remind: 3, repeat: 'half_yearly', location: 'Maruti service centre, HSR Layout' },
  { title: 'Netflix Subscription', categoryId: 'finance', subcategory: 'Subscriptions', inDays: 11, remind: 3, repeat: 'monthly', amount: 649 },
  { title: 'Amazon Prime Subscription', categoryId: 'finance', subcategory: 'Subscriptions', inDays: 18, remind: 3, repeat: 'yearly', amount: 1499 },
  { title: 'Bike PUC', categoryId: 'vehicle', subcategory: 'PUC', inDays: 19, remind: 7, repeat: 'half_yearly', description: 'KA-01 AB 1234' },
  { title: 'Passport', categoryId: 'documents', subcategory: 'Passport', inDays: 21, remind: 30, description: 'Renewal — book Passport Seva appointment', notes: 'Need old passport, Aadhaar and 2 photos' },
  { title: "Mother's Birthday", categoryId: 'personal', subcategory: 'Important dates', inDays: 26, remind: 3, repeat: 'yearly', notes: 'She mentioned wanting a new saree' },
  { title: 'Car Insurance', categoryId: 'vehicle', subcategory: 'Insurance', inDays: 34, remind: 30, repeat: 'yearly', amount: 14500, description: 'ICICI Lombard comprehensive policy' },
  { title: 'Water Filter Replacement', categoryId: 'home', subcategory: 'Maintenance', inDays: 40, remind: 7, repeat: 'yearly', location: 'Kitchen' },
  { title: 'Fridge Warranty', categoryId: 'documents', subcategory: 'Warranties', inDays: 45, remind: 15, description: 'Samsung 2-year warranty', notes: 'Invoice in Gmail, order #4471' },
  { title: 'Car EMI', categoryId: 'finance', subcategory: 'Loans', inDays: 9, remind: 3, repeat: 'monthly', amount: 12850 },
  { title: 'Health Insurance Premium', categoryId: 'finance', subcategory: 'Insurance', inDays: 63, remind: 15, repeat: 'yearly', amount: 22400 },
  { title: 'Driving Licence', categoryId: 'documents', subcategory: 'Driving licence', inDays: 410, remind: 30 },
  { title: 'Pest Control', categoryId: 'home', subcategory: 'Services', inDays: 52, remind: 3, repeat: 'quarterly' },
  { title: 'Gas Cylinder Booking', categoryId: 'home', subcategory: 'Bills', inDays: -3, remind: 0, status: 'completed' },
  { title: 'Old Scooter Insurance', categoryId: 'vehicle', subcategory: 'Insurance', inDays: -40, status: 'archived', description: 'Scooter sold in August' },
];

const SHOPPING: [string, string, string?][] = [
  ['Milk', 'Grocery', '2 L'],
  ['Bread', 'Grocery'],
  ['Rice', 'Grocery', '5 kg'],
  ['Detergent', 'Grocery'],
  ['LED bulbs', 'Home', '2'],
  ['AA batteries', 'Home', '4'],
  ['Toothpaste', 'Personal care'],
];

/** Realistic demo data, with dates relative to today so it never goes stale. */
export function buildSeed(userId: ID): UserData {
  const today = todayISO();
  const stamp = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();

  const memories: Memory[] = [];
  const reminders: Reminder[] = [];
  const recurrences: RecurringItem[] = [];

  MEMORIES.forEach((s, i) => {
    const id = uid('mem');
    const dueDate: ISODate | null = s.inDays == null ? null : addDays(today, s.inDays);
    const createdAt = stamp((MEMORIES.length - i) * 97);
    memories.push({
      id,
      userId,
      title: s.title,
      description: s.description,
      categoryId: s.categoryId,
      subcategory: s.subcategory,
      dueDate,
      status: s.status ?? 'active',
      amount: s.amount ?? null,
      currency: 'INR',
      location: s.location,
      notes: s.notes,
      source: 'seed',
      createdAt,
      updatedAt: createdAt,
      completedAt: s.status === 'completed' ? stamp(60) : null,
    });
    if (dueDate && s.remind != null) {
      reminders.push({ id: uid('rem'), userId, memoryId: id, offsetDays: s.remind, remindOn: addDays(dueDate, -s.remind), notifiedFor: null });
    }
    if (s.repeat && s.repeat !== 'never') {
      const p = REPEAT_PRESETS[s.repeat];
      recurrences.push({ id: uid('rec'), userId, memoryId: id, frequency: p.frequency, interval: p.interval, unit: p.unit, createdAt });
    }
  });

  const person = (name: string, phone?: string): Person => ({ id: uid('per'), userId, name, phone, createdAt: stamp(5000) });
  const rahul = person('Rahul', '+91 98450 12345');
  const amit = person('Amit');
  const priya = person('Priya');
  const neha = person('Neha');

  const lending = (p: Partial<Lending> & Pick<Lending, 'personId' | 'direction' | 'kind' | 'date'>): Lending => ({
    id: uid('len'),
    userId,
    currency: 'INR',
    status: 'open',
    followUpDate: null,
    createdAt: stamp(3000),
    updatedAt: stamp(3000),
    ...p,
  });

  const lendings: Lending[] = [
    lending({ personId: rahul.id, direction: 'lent', kind: 'money', amount: 2000, date: addDays(today, -6), followUpDate: addDays(today, 1), notes: 'For his bike repair' }),
    lending({ personId: amit.id, direction: 'borrowed', kind: 'thing', itemName: 'Drill machine', date: addDays(today, -13), followUpDate: addDays(today, 2), notes: 'Bosch drill + bits box' }),
    lending({ personId: priya.id, direction: 'lent', kind: 'thing', itemName: 'Harry Potter books (1–3)', date: addDays(today, -30), followUpDate: addDays(today, -2) }),
    lending({ personId: neha.id, direction: 'borrowed', kind: 'money', amount: 500, date: addDays(today, -20), status: 'returned', returnedAt: stamp(4000) }),
  ];

  const shopping: ShoppingItem[] = SHOPPING.map(([name, listCategory, quantity], i) => ({
    id: uid('shp'),
    userId,
    name,
    listCategory,
    quantity,
    purchased: false,
    createdAt: stamp(200 - i),
  }));

  return {
    memories,
    reminders,
    recurrences,
    people: [rahul, amit, priya, neha],
    lendings,
    shopping,
    notifications: [
      {
        id: uid('ntf'),
        userId,
        title: 'Welcome to ZarooriBox 👋',
        body: 'This demo is filled with sample memories. Try the Quick Add box: "Bike insurance expires on 17 November".',
        channel: 'in_app',
        createdAt: stamp(1),
        readAt: null,
      },
    ],
    attachments: [],
    settings: defaultSettings(userId),
  };
}
