// Core domain model for ZarooriBox.
// Each entity maps 1:1 to a table in supabase/schema.sql (camelCase here, snake_case in SQL).

export type ID = string;
/** Calendar date in local time, formatted YYYY-MM-DD. */
export type ISODate = string;
/** Full timestamp, ISO 8601. */
export type Timestamp = string;

export type CategoryId =
  | 'personal'
  | 'home'
  | 'finance'
  | 'shopping'
  | 'people'
  | 'vehicle'
  | 'documents'
  | 'health'
  | 'bookings';

export interface Category {
  id: CategoryId;
  name: string;
  emoji: string;
  /** Tailwind classes for the soft badge background + text. */
  tint: string;
  subcategories: string[];
}

export type MemoryStatus = 'active' | 'completed' | 'archived';

export type RepeatFrequency =
  | 'never'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'half_yearly'
  | 'yearly'
  | 'custom';

export type RepeatUnit = 'day' | 'week' | 'month' | 'year';

export interface RepeatSpec {
  frequency: RepeatFrequency;
  interval: number;
  unit: RepeatUnit;
}

export interface User {
  id: ID;
  email: string;
  name: string;
  createdAt: Timestamp;
  isDemo?: boolean;
  /** A demo kept on this device because the server's guest sign-in is switched off. */
  onDevice?: boolean;
}

export interface Memory {
  id: ID;
  userId: ID;
  title: string;
  description?: string;
  categoryId: CategoryId;
  subcategory?: string;
  dueDate?: ISODate | null;
  /** Times of day (HH:mm, sorted) to alert on the due date: medicine doses, a meeting, an appointment. */
  dueTimes?: string[] | null;
  status: MemoryStatus;
  amount?: number | null;
  currency: string;
  personId?: ID | null;
  location?: string;
  notes?: string;
  source: 'manual' | 'quick_add' | 'seed';
  createdAt: Timestamp;
  updatedAt: Timestamp;
  completedAt?: Timestamp | null;
  /** For recurring items: the last time an occurrence was completed. */
  lastCompletedAt?: Timestamp | null;
  /** Set when the memory is shared with the owner's family. */
  householdId?: ID | null;
  /** Starred by the person, listed under Favourites. */
  favorite?: boolean;
}

export interface Reminder {
  id: ID;
  userId: ID;
  memoryId: ID;
  /** Days before the due date. null = absolute reminder date (remindOn). */
  offsetDays: number | null;
  remindOn: ISODate;
  /** The due date this reminder already fired for, so each cycle notifies once. */
  notifiedFor?: ISODate | null;
}

export interface RecurringItem {
  id: ID;
  userId: ID;
  memoryId: ID;
  frequency: RepeatFrequency;
  interval: number;
  unit: RepeatUnit;
  createdAt: Timestamp;
}

export interface Person {
  id: ID;
  userId: ID;
  name: string;
  phone?: string;
  createdAt: Timestamp;
}

export type LendingDirection = 'lent' | 'borrowed';
export type LendingKind = 'money' | 'thing';

export interface Lending {
  id: ID;
  userId: ID;
  personId: ID;
  direction: LendingDirection;
  kind: LendingKind;
  amount?: number | null;
  currency: string;
  itemName?: string;
  date: ISODate;
  followUpDate?: ISODate | null;
  status: 'open' | 'returned';
  returnedAt?: Timestamp | null;
  notes?: string;
  lastReminderAt?: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ShoppingItem {
  id: ID;
  userId: ID;
  name: string;
  quantity?: string;
  listCategory: string;
  purchased: boolean;
  createdAt: Timestamp;
  purchasedAt?: Timestamp | null;
  /** Set when the item is on the family's shared list. */
  householdId?: ID | null;
}

export type NotificationChannelId = 'in_app' | 'browser' | 'email' | 'whatsapp' | 'sms';

export interface AppNotification {
  id: ID;
  userId: ID;
  memoryId?: ID | null;
  lendingId?: ID | null;
  title: string;
  body: string;
  channel: NotificationChannelId;
  createdAt: Timestamp;
  readAt?: Timestamp | null;
}

export interface Attachment {
  id: ID;
  userId: ID;
  memoryId: ID;
  name: string;
  mimeType: string;
  size: number;
  /** Local mode keeps small files inline. Supabase mode uses storagePath. */
  dataUrl?: string;
  storagePath?: string;
  createdAt: Timestamp;
}

export interface NotificationPrefs {
  inApp: boolean;
  browser: boolean;
  email: boolean;
  whatsapp: boolean;
  sms: boolean;
  dailyDigest: boolean;
  digestTime: string; // HH:mm
}

export type PlanId = 'free' | 'pro';

export interface UserSettings {
  userId: ID;
  currency: string;
  defaultReminderDays: number;
  notifications: NotificationPrefs;
  plan: PlanId;
  /** E.164 phone number for WhatsApp and SMS reminders, e.g. +919876543210. */
  phone?: string | null;
  /** IANA timezone, so outside-the-app reminders arrive at the person's chosen local time. */
  timezone?: string;
  /** When the person finished (or skipped) the first-run setup. */
  onboardedAt?: Timestamp | null;
  /** Language of the app screens. */
  language?: AppLanguage;
  /** BCP 47 tag for voice input, e.g. hi-IN. Empty means "match the device". */
  voiceLanguage?: string | null;
  updatedAt: Timestamp;
}

export type AppLanguage = 'en' | 'hi';

export interface FamilyMember {
  userId: ID;
  displayName: string;
  role: 'owner' | 'member';
}

/** A family (household) whose members share chosen bills and the shopping list. */
export interface Family {
  id: ID;
  name: string;
  inviteCode: string;
  members: FamilyMember[];
}

/** Everything that belongs to one user. */
export interface UserData {
  memories: Memory[];
  reminders: Reminder[];
  recurrences: RecurringItem[];
  people: Person[];
  lendings: Lending[];
  shopping: ShoppingItem[];
  notifications: AppNotification[];
  attachments: Attachment[];
  settings: UserSettings | null;
  /** Only in cloud (Supabase) mode. */
  family?: Family | null;
}

export type CollectionName = Exclude<keyof UserData, 'settings' | 'family'>;

export type CollectionRecord<K extends CollectionName> = UserData[K][number];
