import Anthropic from 'npm:@anthropic-ai/sdk@^0.131';
import { MODEL } from './quickAddAI.ts';

// Reads a photo of a document (passport, insurance policy, bill, warranty card) and
// returns what LifeBox needs to remind the person: a title, category and the date
// that matters (expiry, renewal or due date). The client validates every field.

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });

export const SCAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['isDocument', 'title', 'categoryId', 'subcategory', 'dueDate', 'dateMeaning', 'amount', 'reference', 'provider', 'reminderDaysBefore', 'repeatYearly'],
  properties: {
    isDocument: { type: 'boolean' },
    title: { type: 'string' },
    categoryId: { type: 'string', enum: ['personal', 'home', 'finance', 'vehicle', 'documents'] },
    subcategory: nullable({ type: 'string' }),
    dueDate: nullable({ type: 'string' }),
    dateMeaning: { type: 'string', enum: ['expiry', 'renewal', 'due', 'appointment', 'none'] },
    amount: nullable({ type: 'number' }),
    reference: nullable({ type: 'string' }),
    provider: nullable({ type: 'string' }),
    reminderDaysBefore: nullable({ type: 'integer' }),
    repeatYearly: { type: 'boolean' },
  },
} as const;

const SYSTEM = `You read a photo of a document for LifeBox, an Indian personal reminder app, and extract what the person needs to be reminded about.

- isDocument: false if the photo is not a document, bill, policy, card or receipt (then use title "Photo", categoryId "personal", dueDate null, dateMeaning "none").
- title: short Title Case name of the thing, e.g. "Passport", "Car Insurance", "Electricity Bill", "Fridge Warranty", "Driving Licence". Include whose it is only if a name is printed and it helps ("Passport (Ananya)").
- categoryId and subcategory, using: personal (Important dates, Documents, Renewals, Appointments); home (Repairs, Maintenance, Bills, Appliances, Services); finance (Bills, Insurance, Loans, Subscriptions, Payments); vehicle (Insurance, PUC, Service, Registration, Repairs); documents (Passport, Driving licence, PAN, Aadhaar, Certificates, Warranties). Vehicle insurance and PUC are vehicle; health or life insurance is finance/Insurance; electricity, water, gas and internet bills are home/Bills.
- dueDate: the date the person must act by, as YYYY-MM-DD: the expiry or "valid till" date for documents, licences, policies and warranties; the due date for bills. Indian dates are day-first (05/11/2027 is 5 November 2027). Never use the issue date or bill date. null if there is none.
- dateMeaning: what dueDate is.
- amount: the amount payable on a bill or the premium on a policy, as a number in rupees; otherwise null.
- reference: a policy, account, consumer or document number if printed, otherwise null. For Aadhaar and PAN give only the last 4 characters, never the full number.
- provider: the issuer or company (e.g. "HDFC Ergo", "BESCOM"), otherwise null.
- reminderDaysBefore: 30 for passports, licences, registration and insurance; 15 for warranties; 7 for PUC; 2 for bills; null without a dueDate.
- repeatYearly: true for things renewed every year (insurance policies, yearly subscriptions), false otherwise.`;

export interface ScanRequest {
  image: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
  today: string;
}

export async function scanWithClaude(client: Anthropic, req: ScanRequest): Promise<unknown | null> {
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 2000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCAN_SCHEMA as unknown as Record<string, unknown> } },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: req.mediaType, data: req.image } },
          { type: 'text', text: `Today is ${req.today}. Read this document.` },
        ],
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
