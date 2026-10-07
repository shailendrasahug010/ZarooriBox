import type { PlanId } from '../types';

// Monetization scaffolding. The MVP is free; these entitlements decide what a
// future Pro plan unlocks. During early access every account gets Pro features,
// so gates exist in code but never block anyone yet.

export type Feature =
  | 'unlimitedMemories'
  | 'advancedReminders'
  | 'aiQuickAdd'
  | 'attachments'
  | 'familySharing'
  | 'advancedNotifications'
  | 'whatsappReminders'
  | 'multipleCalendars';

export interface PlanDefinition {
  id: PlanId;
  name: string;
  priceLabel: string;
  limits: { memories: number; recurring: number; attachmentsPerMemory: number };
  features: Feature[];
  highlights: string[];
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: 'free',
    name: 'Free',
    priceLabel: '₹0 forever',
    limits: { memories: 200, recurring: 25, attachmentsPerMemory: 0 },
    features: [],
    highlights: ['Up to 200 reminders', 'Shopping list', 'Limited recurring items'],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceLabel: 'Coming soon',
    limits: { memories: Infinity, recurring: Infinity, attachmentsPerMemory: 10 },
    features: [
      'unlimitedMemories',
      'advancedReminders',
      'aiQuickAdd',
      'attachments',
      'familySharing',
      'advancedNotifications',
      'whatsappReminders',
      'multipleCalendars',
    ],
    highlights: [
      'Unlimited reminders',
      'Advanced reminders',
      'AI natural-language entry',
      'Attachments',
      'Family sharing',
      'WhatsApp reminders',
      'Multiple calendars',
    ],
  },
};

/** Flip to false when Pro launches. */
export const EARLY_ACCESS = true;

export function effectivePlan(plan: PlanId): PlanDefinition {
  return EARLY_ACCESS ? PLANS.pro : PLANS[plan];
}

export function can(plan: PlanId, feature: Feature): boolean {
  return effectivePlan(plan).features.includes(feature);
}

export function limit(plan: PlanId, key: keyof PlanDefinition['limits']): number {
  return effectivePlan(plan).limits[key];
}
