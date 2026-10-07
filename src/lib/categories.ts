import type { Category, CategoryId } from '../types';

export const CATEGORIES: Category[] = [
  {
    id: 'personal',
    name: 'Personal',
    emoji: '✨',
    tint: 'bg-violet-50 text-violet-700',
    subcategories: ['Important dates', 'Documents', 'Renewals', 'Appointments', 'Meetings'],
  },
  {
    id: 'home',
    name: 'Home',
    emoji: '🏠',
    tint: 'bg-amber-50 text-amber-800',
    subcategories: ['Repairs', 'Maintenance', 'Bills', 'Appliances', 'Services'],
  },
  {
    id: 'finance',
    name: 'Finance',
    emoji: '💳',
    tint: 'bg-sky-50 text-sky-800',
    subcategories: ['Bills', 'Insurance', 'Loans', 'Subscriptions', 'Payments'],
  },
  {
    id: 'shopping',
    name: 'Shopping',
    emoji: '🛒',
    tint: 'bg-lime-50 text-lime-800',
    subcategories: ['Shopping list', 'Grocery', 'Wishlist'],
  },
  {
    id: 'people',
    name: 'People',
    emoji: '👥',
    tint: 'bg-rose-50 text-rose-700',
    subcategories: ['Money lent', 'Money borrowed', 'Things lent', 'Things borrowed'],
  },
  {
    id: 'vehicle',
    name: 'Vehicle',
    emoji: '🚗',
    tint: 'bg-slate-100 text-slate-700',
    subcategories: ['Insurance', 'PUC', 'Service', 'Registration', 'Repairs'],
  },
  {
    id: 'documents',
    name: 'Documents',
    emoji: '📄',
    tint: 'bg-teal-50 text-teal-800',
    subcategories: ['Passport', 'Driving licence', 'PAN', 'Aadhaar', 'Certificates', 'Warranties'],
  },
  {
    id: 'health',
    name: 'Health',
    emoji: '💊',
    tint: 'bg-pink-50 text-pink-700',
    subcategories: ['Medicines', 'Doctor visits', 'Tests', 'Vaccines'],
  },
  {
    id: 'bookings',
    name: 'Bookings',
    emoji: '🎟️',
    tint: 'bg-indigo-50 text-indigo-700',
    subcategories: ['Travel', 'Tickets', 'Hotel', 'Restaurant', 'Events', 'Appointments'],
  },
];

const byId = new Map(CATEGORIES.map((c) => [c.id, c]));

export function getCategory(id: CategoryId): Category {
  return byId.get(id) ?? CATEGORIES[0];
}

/** Categories you can file a memory under (shopping + people have their own screens). */
export const MEMORY_CATEGORIES = CATEGORIES.filter((c) => c.id !== 'shopping' && c.id !== 'people');

export const SHOPPING_LISTS = ['Grocery', 'Home', 'Personal care', 'Wishlist', 'Other'];

/** Subcategories that are really about something expiring or renewing. */
export const EXPIRY_SUBCATEGORIES = new Set([
  'Insurance',
  'PUC',
  'Registration',
  'Subscriptions',
  'Renewals',
  'Passport',
  'Driving licence',
  'PAN',
  'Aadhaar',
  'Certificates',
  'Warranties',
  'Documents',
]);
