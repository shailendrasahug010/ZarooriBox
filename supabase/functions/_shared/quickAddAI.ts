import Anthropic from 'npm:@anthropic-ai/sdk@^0.131';

// Turns a one-line Quick Add sentence into Zaroori's structured shape using Claude.
// The browser never sees the API key: it calls the parse-quick-add function, which
// calls this. The client still validates every field and falls back to its rule parser.

export const MODEL = Deno.env.get('ZAROORI_AI_MODEL') ?? 'claude-opus-5-5';

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });

export const PARSED_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'kind', 'title', 'categoryId', 'subcategory', 'dueDate', 'reminderDaysBefore', 'repeat', 'amount',
    'person', 'direction', 'lendingKind', 'thing', 'followUpDate', 'shoppingItems', 'isExpiry',
  ],
  properties: {
    kind: { type: 'string', enum: ['memory', 'lending', 'shopping'] },
    title: { type: 'string' },
    categoryId: { type: 'string', enum: ['personal', 'home', 'finance', 'shopping', 'people', 'vehicle', 'documents'] },
    subcategory: nullable({ type: 'string' }),
    dueDate: nullable({ type: 'string' }),
    reminderDaysBefore: nullable({ type: 'integer' }),
    repeat: {
      type: 'object',
      additionalProperties: false,
      required: ['frequency', 'interval', 'unit'],
      properties: {
        frequency: { type: 'string', enum: ['never', 'daily', 'weekly', 'monthly', 'quarterly', 'half_yearly', 'yearly', 'custom'] },
        interval: { type: 'integer' },
        unit: { type: 'string', enum: ['day', 'week', 'month', 'year'] },
      },
    },
    amount: nullable({ type: 'number' }),
    person: nullable({ type: 'string' }),
    direction: nullable({ type: 'string', enum: ['lent', 'borrowed'] }),
    lendingKind: nullable({ type: 'string', enum: ['money', 'thing'] }),
    thing: nullable({ type: 'string' }),
    followUpDate: nullable({ type: 'string' }),
    shoppingItems: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'quantity', 'listCategory'],
        properties: {
          name: { type: 'string' },
          quantity: nullable({ type: 'string' }),
          listCategory: { type: 'string', enum: ['Grocery', 'Home', 'Personal care', 'Wishlist', 'Other'] },
        },
      },
    },
    isExpiry: { type: 'boolean' },
  },
} as const;

// Kept byte-stable so it can be cached; the per-request date goes in the user turn.
const SYSTEM = `You turn one short sentence a person typed into Zaroori (a personal reminder app, popular in India) into structured data.

Decide the kind:
- "lending" when money or a thing was lent to or borrowed from a person ("I lent Rahul ₹2000", "borrowed a drill from Amit", "Neha owes me 500"). Set person, direction, lendingKind, amount (money) or thing (object, capitalised like "Drill machine"). dueDate is the date it happened (today if not said); followUpDate is when to chase it (the date mentioned if it is in the future, otherwise 7 days after dueDate). categoryId "people".
- "shopping" when the person wants to buy items with no date ("buy milk and bread", "need LED bulbs"). Put each item in shoppingItems with quantity if given. categoryId "shopping".
- "memory" for everything else: renewals, bills, expiry dates, maintenance, appointments, birthdays.

Rules for memories:
- title: short and in Title Case, without the date or filler words ("Car Insurance", "RO Filter Change", "Mother's Birthday"). Keep acronyms uppercase (RO, AC, PUC, PAN, EMI).
- categoryId and subcategory, using these subcategories: personal (Important dates, Documents, Renewals, Appointments); home (Repairs, Maintenance, Bills, Appliances, Services); finance (Bills, Insurance, Loans, Subscriptions, Payments); vehicle (Insurance, PUC, Service, Registration, Repairs); documents (Passport, Driving licence, PAN, Aadhaar, Certificates, Warranties). Vehicle insurance is vehicle/Insurance; health or life insurance is finance/Insurance; electricity, water, gas and internet bills are home/Bills.
- dueDate as YYYY-MM-DD. Dates are day-first (12/02 is 12 February). A date without a year means its next occurrence on or after today.
- repeat: frequency "never" with interval 0 and unit "day" when it does not repeat. Every 3 months is "quarterly", every 6 months is "half_yearly"; other intervals are "custom". A repeating item with no date is first due one interval from today (daily items: today).
- reminderDaysBefore: 30 for insurance, passport, licence, registration; 15 for warranties; 7 for PUC and filters; 3 for subscriptions, services, loans; 2 for bills; 1 for birthdays and appointments; null when there is no dueDate.
- isExpiry: true for things that expire or renew (insurance, documents, warranties, subscriptions, PUC).
- amount only when a sum of money is stated; "2k" is 2000, "1 lakh" is 100000.

The sentence may be in English, Hindi, Hinglish or another Indian language, in any script (for example "कल बिजली का बिल भरना है" or "Rahul ko 500 diye"). Understand it whatever the language. Write title and shopping item names in the language the person used (keep Devanagari as Devanagari); everything else follows the rules above. In Hindi, "कल" in a plan means tomorrow.

Fields that do not apply to the chosen kind are null (shoppingItems is an empty array).`;

export interface ParseRequest {
  text: string;
  today: string;
  currency: string;
}

export async function parseWithClaude(client: Anthropic, req: ParseRequest): Promise<unknown | null> {
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 2000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    // A one-line extraction: low effort keeps it fast and cheap.
    output_config: { effort: 'low', format: { type: 'json_schema', schema: PARSED_SCHEMA as unknown as Record<string, unknown> } },
    messages: [
      {
        role: 'user',
        content: `Today is ${req.today}. Default currency: ${req.currency}.\n\n<sentence>${req.text}</sentence>`,
      },
    ],
  });

  if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') return null;
  for (const block of response.content) {
    if (block.type === 'text') {
      try {
        return JSON.parse(block.text);
      } catch {
        return null;
      }
    }
  }
  return null;
}
