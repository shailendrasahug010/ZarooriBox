import type { CategoryId, ISODate, RepeatSpec, RepeatUnit } from '../../types';
import { addDays, addUnit, fromISO, isValidISO, REPEAT_PRESETS, specFor, toISO } from '../dates';
import { capitalizeName, formatMoney, titleCase } from '../format';
import type { ParseContext, ParsedQuickAdd, ParsedShoppingItem, QuickAddParser } from './types';
import { hindiHints, normalizeHindi } from './hindi';

// Rule-based natural-language parser for Quick Add.
// It works by peeling recognised phrases (repeat, date, amount) off the text,
// then deciding what kind of thing is left: a loan, a shopping list, or a memory.

/** Mutable text that extractors remove matches from. */
class Cursor {
  constructor(public text: string) {}
  take(re: RegExp): RegExpExecArray | null {
    const m = re.exec(this.text);
    if (m) this.text = `${this.text.slice(0, m.index)} ${this.text.slice(m.index + m[0].length)}`;
    return m;
  }
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};
const MONTH_RE =
  '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, other: 2, couple: 2,
};
const NUM = `(\\d+|${Object.keys(NUMBER_WORDS).join('|')})`;
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WEEKDAY_SHORT: Record<string, number> = { sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6 };
/** Prepositions that belong to a date phrase and should vanish with it. */
const PREP = '(?:(?:on|by|before|till|until|from|of|dated)\\s+)?';

const toNumber = (s: string) => (/^\d+$/.test(s) ? Number(s) : NUMBER_WORDS[s.toLowerCase()] ?? 1);
const unitOf = (s: string) => s.toLowerCase().replace(/s$/, '') as RepeatUnit;

function monthIndex(s: string): number {
  return MONTHS[s.toLowerCase().slice(0, 3)];
}

function makeDate(y: number, m: number, d: number): ISODate | null {
  const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return isValidISO(iso) ? iso : null;
}

interface DateHit {
  date: ISODate;
  /** When a yearless date had already passed, the past version we skipped. */
  pastVersion?: ISODate;
  explicit: boolean;
}

/** Yearless "17 Nov": this year if still ahead, otherwise next year. */
function yearless(m: number, d: number, today: ISODate): DateHit | null {
  const y = fromISO(today).getFullYear();
  const thisYear = makeDate(y, m, d);
  if (!thisYear) return null;
  if (thisYear >= today) return { date: thisYear, explicit: true };
  const next = makeDate(y + 1, m, d);
  return next ? { date: next, pastVersion: thisYear, explicit: true } : null;
}

function nextWeekday(target: number, today: ISODate): ISODate {
  const dow = fromISO(today).getDay();
  let diff = (target - dow + 7) % 7;
  if (diff === 0) diff = 7;
  return addDays(today, diff);
}

function nextDayOfMonth(day: number, today: ISODate): ISODate | null {
  const t = fromISO(today);
  for (let i = 0; i < 3; i++) {
    const d = new Date(t.getFullYear(), t.getMonth() + i, day);
    const candidate = d.getDate() === day ? toISO(d) : null;
    if (candidate && candidate >= today) return candidate;
  }
  return null;
}

function extractDate(cur: Cursor, today: ISODate): DateHit | null {
  let m: RegExpExecArray | null;
  // 2027-02-12
  if ((m = cur.take(new RegExp(`\\b${PREP}(\\d{4})-(\\d{1,2})-(\\d{1,2})\\b`, 'i')))) {
    const d = makeDate(+m[1], +m[2] - 1, +m[3]);
    if (d) return { date: d, explicit: true };
  }
  // 12/02/2027, 12-02-27, 12.02 (day first, as written in India and most of the world)
  if ((m = cur.take(new RegExp(`\\b${PREP}(\\d{1,2})[/.-](\\d{1,2})(?:[/.-](\\d{2,4}))?\\b`, 'i')))) {
    const day = +m[1];
    const mon = +m[2] - 1;
    if (m[3]) {
      const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
      const d = makeDate(y, mon, day);
      if (d) return { date: d, explicit: true };
    } else {
      const hit = yearless(mon, day, today);
      if (hit) return hit;
    }
  }
  // 12 February 2027, 17th of Nov
  if ((m = cur.take(new RegExp(`\\b${PREP}(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}\\.?(?:,?\\s+(\\d{4}))?\\b`, 'i')))) {
    const mon = monthIndex(m[2]);
    if (m[3]) {
      const d = makeDate(+m[3], mon, +m[1]);
      if (d) return { date: d, explicit: true };
    } else {
      const hit = yearless(mon, +m[1], today);
      if (hit) return hit;
    }
  }
  // February 12, 2027 / Nov 17
  if ((m = cur.take(new RegExp(`\\b${PREP}${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, 'i')))) {
    const mon = monthIndex(m[1]);
    if (m[3]) {
      const d = makeDate(+m[3], mon, +m[2]);
      if (d) return { date: d, explicit: true };
    } else {
      const hit = yearless(mon, +m[2], today);
      if (hit) return hit;
    }
  }
  // March 2027
  if ((m = cur.take(new RegExp(`\\b${PREP}(?:in\\s+)?${MONTH_RE}\\s+(\\d{4})\\b`, 'i')))) {
    const d = makeDate(+m[2], monthIndex(m[1]), 1);
    if (d) return { date: d, explicit: true };
  }
  if (cur.take(/\b(?:on\s+|by\s+)?(?:the\s+)?day\s+after\s+tomorrow\b/i)) return { date: addDays(today, 2), explicit: true };
  if (cur.take(/\b(?:by\s+)?(?:today|tonight)\b/i)) return { date: today, explicit: true };
  if (cur.take(/\b(?:by\s+)?(?:tomorrow|tmrw|tmr)\b/i)) return { date: addDays(today, 1), explicit: true };
  if (cur.take(/\byesterday\b/i)) return { date: addDays(today, -1), explicit: true };
  // in 5 days / within 2 weeks / after 3 months
  if ((m = cur.take(new RegExp(`\\b(?:in|after|within)\\s+${NUM}\\s+(day|week|month|year)s?\\b`, 'i')))) {
    return { date: addUnit(today, toNumber(m[1]), unitOf(m[2])), explicit: true };
  }
  if ((m = cur.take(/\bnext\s+(week|month|year)\b/i))) {
    return { date: addUnit(today, 1, unitOf(m[1])), explicit: true };
  }
  if (cur.take(/\b(?:by\s+)?(?:the\s+)?end\s+of\s+(?:the\s+|this\s+)?month\b/i)) {
    const d = fromISO(today);
    return { date: toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0)), explicit: true };
  }
  if ((m = cur.take(new RegExp(`\\b(?:(?:on|by|this|next|coming)\\s+)?(${WEEKDAYS.join('|')})\\b`, 'i')))) {
    return { date: nextWeekday(WEEKDAYS.indexOf(m[1].toLowerCase()), today), explicit: true };
  }
  if ((m = cur.take(/\b(?:on|by|this|next|coming)\s+(sun|mon|tues?|wed|thu(?:rs?)?|fri|sat)\b/i))) {
    return { date: nextWeekday(WEEKDAY_SHORT[m[1].toLowerCase()], today), explicit: true };
  }
  // "on the 5th" (next time that day of the month comes round)
  if ((m = cur.take(/\b(?:on|by|before)\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b/i))) {
    const d = nextDayOfMonth(+m[1], today);
    if (d) return { date: d, explicit: true };
  }
  return null;
}

interface RepeatHit {
  spec: RepeatSpec;
  /** Some phrases also pin a date: "every Monday", "5th of every month". */
  anchor?: ISODate;
}

function extractRepeat(cur: Cursor, today: ISODate): RepeatHit | null {
  let m: RegExpExecArray | null;
  if ((m = cur.take(/\b(?:on\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+of\s+(?:every|each)\s+month\b/i))) {
    return { spec: { ...REPEAT_PRESETS.monthly }, anchor: nextDayOfMonth(+m[1], today) ?? undefined };
  }
  if ((m = cur.take(new RegExp(`\\b(?:every|each)\\s+(${WEEKDAYS.join('|')})\\b`, 'i')))) {
    return { spec: { ...REPEAT_PRESETS.weekly }, anchor: nextWeekday(WEEKDAYS.indexOf(m[1].toLowerCase()), today) };
  }
  if ((m = cur.take(new RegExp(`\\b(?:every|each)\\s+${NUM}\\s+(day|week|month|year)s?\\b`, 'i')))) {
    return { spec: specFor(toNumber(m[1]), unitOf(m[2])) };
  }
  if ((m = cur.take(/\b(?:every|each|once\s+(?:a|every|per))\s+(day|week|month|year)\b/i))) {
    return { spec: specFor(1, unitOf(m[1])) };
  }
  if (cur.take(/\btwice\s+a\s+year\b/i)) return { spec: { ...REPEAT_PRESETS.half_yearly } };
  if (cur.take(/\btwice\s+a\s+month\b/i)) return { spec: specFor(2, 'week') };
  if ((m = cur.take(/\b(daily|weekly|fortnightly|bi-?weekly|monthly|quarterly|half[-\s]?yearly|semi-?annual(?:ly)?|bi-?annual(?:ly)?|yearly|annually|annual)\b/i))) {
    const w = m[1].toLowerCase().replace(/[-\s]/g, '');
    if (w === 'daily') return { spec: { ...REPEAT_PRESETS.daily } };
    if (w === 'weekly') return { spec: { ...REPEAT_PRESETS.weekly } };
    if (w === 'fortnightly' || w === 'biweekly') return { spec: specFor(2, 'week') };
    if (w === 'monthly') return { spec: { ...REPEAT_PRESETS.monthly } };
    if (w === 'quarterly') return { spec: { ...REPEAT_PRESETS.quarterly } };
    if (w.startsWith('half') || w.startsWith('semi') || w.startsWith('bi')) return { spec: { ...REPEAT_PRESETS.half_yearly } };
    return { spec: { ...REPEAT_PRESETS.yearly } };
  }
  return null;
}

interface AmountHit {
  amount: number;
  currency: string;
}

function toAmount(num: string, mult?: string): number {
  let n = parseFloat(num.replace(/,/g, ''));
  const m = (mult ?? '').toLowerCase();
  if (m === 'k') n *= 1_000;
  if (m === 'l' || m.startsWith('lakh') || m.startsWith('lac')) n *= 100_000;
  if (m === 'cr' || m.startsWith('crore')) n *= 10_000_000;
  return n;
}

const MULT = '(k|lakhs?|lacs?|l|cr|crores?)?';

function extractAmount(cur: Cursor, allowBare: boolean): AmountHit | null {
  let m: RegExpExecArray | null;
  if ((m = cur.take(new RegExp(`(?:₹|\\b(?:rs|inr)\\.?)\\s*(\\d[\\d,]*(?:\\.\\d+)?)\\s*${MULT}\\b`, 'i')))) {
    return { amount: toAmount(m[1], m[2]), currency: 'INR' };
  }
  if ((m = cur.take(new RegExp(`\\b(\\d[\\d,]*(?:\\.\\d+)?)\\s*${MULT}\\s*(?:₹|rs\\.?|inr|rupees?|bucks|\\/-)`, 'i')))) {
    return { amount: toAmount(m[1], m[2]), currency: 'INR' };
  }
  if ((m = cur.take(/(?:\$|\busd\s*)(\d[\d,]*(?:\.\d+)?)\b/i))) {
    return { amount: toAmount(m[1]), currency: 'USD' };
  }
  if ((m = cur.take(/(?:€|\beur\s*)(\d[\d,]*(?:\.\d+)?)\b/i))) {
    return { amount: toAmount(m[1]), currency: 'EUR' };
  }
  if (allowBare && (m = cur.take(new RegExp(`\\b(\\d[\\d,]*(?:\\.\\d+)?)\\s*${MULT}\\b`, 'i')))) {
    if (m[1].length > 1 || m[2]) return { amount: toAmount(m[1], m[2]), currency: 'INR' };
  }
  return null;
}

// ---------- Categorisation ----------

interface CategoryRule {
  re: RegExp;
  categoryId: CategoryId;
  subcategory?: string;
  reminder: number;
  expiry?: boolean;
}

const VEH = '(?:car|bike|scooter|scooty|vehicle|two[- ]wheeler|motorcycle|motorbike|activa|cycle)';

const CATEGORY_RULES: CategoryRule[] = [
  { re: new RegExp(`\\b${VEH}\\b.*\\binsurance\\b|\\binsurance\\b.*\\b${VEH}\\b`, 'i'), categoryId: 'vehicle', subcategory: 'Insurance', reminder: 30, expiry: true },
  { re: /\b(puc|pollution)\b/i, categoryId: 'vehicle', subcategory: 'PUC', reminder: 7, expiry: true },
  { re: new RegExp(`\\b(rc\\b|registration certificate|${VEH}\\s+registration)`, 'i'), categoryId: 'vehicle', subcategory: 'Registration', reminder: 30, expiry: true },
  { re: new RegExp(`\\b${VEH}\\b.*\\b(repair|tyre|tire|puncture|dent|scratch|battery)`, 'i'), categoryId: 'vehicle', subcategory: 'Repairs', reminder: 2 },
  { re: new RegExp(`\\b${VEH}\\b|\\b(oil change|car wash)\\b`, 'i'), categoryId: 'vehicle', subcategory: 'Service', reminder: 3 },
  { re: /\bpassport\b/i, categoryId: 'documents', subcategory: 'Passport', reminder: 30, expiry: true },
  { re: /\b(driving\s+licen[cs]e|licen[cs]e|dl)\b/i, categoryId: 'documents', subcategory: 'Driving licence', reminder: 30, expiry: true },
  { re: /\b(aadhaa?r|adhar)\b/i, categoryId: 'documents', subcategory: 'Aadhaar', reminder: 7, expiry: true },
  { re: /\bpan(\s+card)?\b/i, categoryId: 'documents', subcategory: 'PAN', reminder: 7, expiry: true },
  { re: /\b(warranty|guarantee|extended warranty)\b/i, categoryId: 'documents', subcategory: 'Warranties', reminder: 15, expiry: true },
  { re: /\b(certificate|visa|voter\s+id|marksheet|degree)\b/i, categoryId: 'documents', subcategory: 'Certificates', reminder: 30, expiry: true },
  { re: /\b(insurance|premium|lic|mediclaim)\b/i, categoryId: 'finance', subcategory: 'Insurance', reminder: 15, expiry: true },
  { re: /\b(subscription|netflix|prime|spotify|hotstar|jiocinema|youtube premium|disney|zee5|sonyliv|icloud|google one|membership|gym|domain|hosting)\b/i, categoryId: 'finance', subcategory: 'Subscriptions', reminder: 3, expiry: true },
  { re: /\b(loan|emi)\b/i, categoryId: 'finance', subcategory: 'Loans', reminder: 3 },
  { re: /\b(credit\s+card|card\s+bill)\b/i, categoryId: 'finance', subcategory: 'Bills', reminder: 3 },
  { re: /\b(sip|mutual fund|fd|fixed deposit|ppf|nps|tax|itr|gst|rent|school fees?|tuition fees?|fees)\b/i, categoryId: 'finance', subcategory: 'Payments', reminder: 3 },
  { re: /\b(ro|water filter|water purifier|purifier|filter|tank cleaning|water tank)\b/i, categoryId: 'home', subcategory: 'Maintenance', reminder: 7 },
  { re: /\b(ac|air\s*conditioner|geyser|fridge|refrigerator|washing machine|chimney|inverter|microwave|tv|cooler|dishwasher|appliance)\b.*\b(service|servicing|clean|cleaning|gas refill|check)\b|\b(service|servicing)\b.*\b(ac|geyser|fridge|chimney|inverter)\b/i, categoryId: 'home', subcategory: 'Services', reminder: 3 },
  { re: /\b(pest control|plumber|electrician|carpenter|painting|deep clean|cleaning|maid|cook|gardener|sofa cleaning)\b/i, categoryId: 'home', subcategory: 'Services', reminder: 3 },
  { re: /\b(leak|leaking|broken|repair|fix|crack|seepage)\b/i, categoryId: 'home', subcategory: 'Repairs', reminder: 2 },
  { re: /\b(electricity|light bill|water bill|gas|cylinder|wifi|wi-fi|broadband|internet|dth|tata play|recharge|postpaid|society maintenance|maintenance bill|phone bill|mobile bill)\b/i, categoryId: 'home', subcategory: 'Bills', reminder: 2 },
  { re: /\b(ac|air\s*conditioner|geyser|fridge|refrigerator|washing machine|chimney|inverter|microwave|tv|cooler|dishwasher|appliance)\b/i, categoryId: 'home', subcategory: 'Appliances', reminder: 3 },
  { re: /\b(maintenance|service)\b/i, categoryId: 'home', subcategory: 'Maintenance', reminder: 3 },
  { re: /\bbills?\b/i, categoryId: 'finance', subcategory: 'Bills', reminder: 2 },
  { re: /\b(birthday|bday|b'day|anniversary|wedding)\b/i, categoryId: 'personal', subcategory: 'Important dates', reminder: 1 },
  { re: /\b(doctor|dentist|appointment|check-?up|vaccination|vaccine|hospital|clinic|meeting|interview|exam|ptm|haircut|salon)\b/i, categoryId: 'personal', subcategory: 'Appointments', reminder: 1 },
  { re: /\b(renew|renewal|expires?|expiry|expiring)\b/i, categoryId: 'personal', subcategory: 'Renewals', reminder: 7, expiry: true },
];

export function categorize(text: string): CategoryRule | null {
  return CATEGORY_RULES.find((r) => r.re.test(text)) ?? null;
}

// ---------- Shopping ----------

const GROCERY = /\b(milk|bread|rice|eggs?|dal|atta|flour|sugar|salt|oil|ghee|butter|paneer|curd|dahi|cheese|tea|coffee|vegetables?|veggies|fruits?|onions?|potato(?:es)?|tomato(?:es)?|banana|apple|biscuits?|snacks|masala|spices|detergent|soap|surf|vim|dishwash|maggi|noodles|cereal|oats|honey|jam|water|juice|chicken|fish|meat|mutton)\b/i;
const HOME_ITEMS = /\b(bulbs?|led|batter(?:y|ies)|tube ?light|extension|switch|fuse|broom|mop|bucket|phenyl|harpic|lizol|cleaner|tissue|garbage bags?|dustbin|hanger|towel|bedsheet|curtain|pillow|tape|screws?|nails)\b/i;
const CARE_ITEMS = /\b(shampoo|toothpaste|toothbrush|razor|cream|lotion|deodorant|sanitary|pads|diapers?|facewash|face wash|sunscreen|medicine|tablets?)\b/i;

export function guessShoppingList(name: string): string {
  if (CARE_ITEMS.test(name)) return 'Personal care';
  if (HOME_ITEMS.test(name)) return 'Home';
  if (GROCERY.test(name)) return 'Grocery';
  return 'Grocery';
}

const QTY_UNITS = '(?:kg|kgs|g|gm|gms|grams?|l|ltr|litres?|liters?|ml|dozen|packs?|packets?|pkts?|pcs|pieces?|bottles?|boxes?|tins?|cans?|bags?)';

function parseShoppingItem(chunk: string): ParsedShoppingItem | null {
  let s = chunk.trim().replace(/^(?:some|a|an|the|more)\s+/i, '').replace(/[.!]+$/, '').trim();
  if (!s) return null;
  let quantity: string | undefined;
  let m: RegExpExecArray | null;
  if ((m = new RegExp(`^(\\d+(?:\\.\\d+)?\\s*${QTY_UNITS}?|half\\s+(?:a\\s+)?${QTY_UNITS}|a\\s+dozen)\\s+(?:of\\s+)?(.+)$`, 'i').exec(s))) {
    quantity = m[1].trim();
    s = m[2];
  } else if ((m = /^(.+?)\s*[x×]\s*(\d+)$/i.exec(s))) {
    s = m[1];
    quantity = m[2];
  } else if ((m = new RegExp(`^(.+?)\\s+(\\d+(?:\\.\\d+)?\\s*${QTY_UNITS})$`, 'i').exec(s))) {
    s = m[1];
    quantity = m[2];
  }
  s = s.trim();
  if (!s) return null;
  const name = s.charAt(0).toUpperCase() + s.slice(1);
  return { name, quantity, listCategory: guessShoppingList(name) };
}

function splitItems(list: string): ParsedShoppingItem[] {
  return list
    .split(/\s*(?:,|;|\band\b|&|\+)\s*/i)
    .map(parseShoppingItem)
    .filter((x): x is ParsedShoppingItem => !!x);
}

const NOT_SHOPPING = /\b(service|serviced|servicing|repair|repaired|fixed|checked|renew|renewed|cleaned|done|appointment|insurance|ticket|passport|licen[cs]e|vaccin)/i;

function detectShopping(text: string): ParsedShoppingItem[] | null {
  const t = text.trim();
  let m: RegExpExecArray | null;
  if ((m = /^(?:shopping(?:\s+list)?|grocery|groceries)\s*[:\-–]\s*(.+)$/i.exec(t))) return splitItems(m[1]);
  if ((m = /^(?:add\s+)?(.+?)\s+(?:to|in|on)\s+(?:the\s+|my\s+)?(?:shopping|grocery|groceries)(?:\s+list)?\.?$/i.exec(t))) return splitItems(m[1]);
  if ((m = /^(?:please\s+)?(?:buy|purchase|order)\s+(.+)$/i.exec(t))) return splitItems(m[1]);
  if ((m = /^(?:please\s+)?(?:get|pick\s+up|need(?:\s+to\s+(?:buy|get))?|we\s+need|out\s+of|running\s+out\s+of)\s+(.+)$/i.exec(t))) {
    if (NOT_SHOPPING.test(m[1])) return null;
    return splitItems(m[1]);
  }
  return null;
}

// ---------- Lending ----------

const NOT_NAMES = new Set([
  'my', 'a', 'an', 'the', 'him', 'her', 'them', 'me', 'some', 'money', 'cash', 'it', 'this', 'that', 'his', 'our', 'to', 'from', 'back',
]);
// Names may be written in any script ("Rahul", "राहुल").
const NAME = "([\\p{L}][\\p{L}\\p{M}'-]*)";

interface LendingHit {
  direction: 'lent' | 'borrowed';
  person: string;
  thing: string;
}

function detectLending(text: string): LendingHit | null {
  const t = text.replace(/\s+/g, ' ').trim();
  const tries: [RegExp, 'lent' | 'borrowed', number, number][] = [
    // [regex, direction, personGroup, thingGroup]
    [new RegExp(`\\b(?:i\\s+)?(?:have\\s+)?(?:lent|loaned|lend|gave|given)\\s+(?:(.*?)\\s+)?to\\s+${NAME}`, 'iu'), 'lent', 2, 1],
    [new RegExp(`\\b(?:i\\s+)?(?:have\\s+)?(?:lent|loaned|lend|gave|given)\\s+${NAME}\\s*(.*)$`, 'iu'), 'lent', 1, 2],
    [new RegExp(`\\b${NAME}\\s+owes\\s+me\\b\\s*(.*)$`, 'iu'), 'lent', 1, 2],
    [new RegExp(`\\b${NAME}\\s+(?:has|took|borrowed)\\s+my\\s+(.+)$`, 'iu'), 'lent', 1, 2],
    [new RegExp(`\\b(?:i\\s+)?(?:have\\s+)?borrowed\\s+(?:(.*?)\\s+)?from\\s+${NAME}`, 'iu'), 'borrowed', 2, 1],
    [new RegExp(`\\b(?:i\\s+)?owe\\s+${NAME}\\s*(.*)$`, 'iu'), 'borrowed', 1, 2],
    [new RegExp(`\\b${NAME}\\s+(?:lent|gave|loaned)\\s+me\\s+(.*)$`, 'iu'), 'borrowed', 1, 2],
  ];
  for (const [re, direction, pg, tg] of tries) {
    const m = re.exec(t);
    if (!m) continue;
    const person = m[pg];
    if (!person || NOT_NAMES.has(person.toLowerCase())) continue;
    return { direction, person: capitalizeName(person), thing: (m[tg] ?? '').trim() };
  }
  return null;
}

function cleanThing(thing: string): string {
  return thing
    .replace(/\b(?:back|for now|for a while|for|to|from|today|now)\s*$/i, '')
    .replace(/^(?:my|a|an|the|his|her|some|our)\s+/i, '')
    .replace(/[.,;:!]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------- Title ----------

function cleanTitle(s: string): string {
  let t = s
    .replace(/^\s*(?:please\s+)?(?:remind\s+me\s+(?:to|about|of|that)|remember\s+(?:to|that)|don'?t\s+forget\s+(?:to|about|that)?|note\s*:?|todo\s*:?)\s+/i, '')
    .replace(/\b(?:expires?|expiring|expiry(?:\s+date)?(?:\s+is)?|is\s+due|are\s+due|due\s+date(?:\s+is)?|due|valid\s+(?:till|until|upto|up\s+to)|ends?)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Trailing / leading connectors left behind by removed phrases.
  for (let i = 0; i < 4; i++) {
    t = t
      .replace(/[\s,.;:–-]+$/, '')
      .replace(/\s+\b(?:on|by|before|at|in|from|until|till|of|is|are|for|the|and|starting|from|after)$/i, '')
      .replace(/^(?:on|by|the|is|and)\s+/i, '')
      .trim();
  }
  return t;
}

// ---------- Main ----------

export function parseQuickAdd(raw: string, ctx: ParseContext): ParsedQuickAdd {
  // Hindi / Hinglish phrases become English the extractors below understand.
  const text = normalizeHindi(raw.trim().replace(/\s+/g, ' '));
  const today = ctx.today;
  const cur = new Cursor(text);

  const repeatHit = extractRepeat(cur, today);
  const dateHit = extractDate(cur, today);
  const lendingProbe = detectLending(cur.text);
  const amountHit = extractAmount(cur, !!lendingProbe);
  const repeat: RepeatSpec = repeatHit?.spec ?? { ...REPEAT_PRESETS.never };

  const base = {
    raw,
    amount: amountHit?.amount ?? null,
    repeat,
    isExpiry: false,
  };

  // 1. Lending / borrowing
  const lending = detectLending(cur.text);
  if (lending) {
    let date = today;
    let followUpDate: ISODate | null = addDays(today, 7);
    if (dateHit) {
      const past = dateHit.pastVersion ?? dateHit.date;
      if (dateHit.date > today && !dateHit.pastVersion) {
        followUpDate = dateHit.date; // "return by Friday"
      } else {
        date = past;
        followUpDate = addDays(past, 7);
      }
    }
    const thing = cleanThing(lending.thing);
    const isMoney = amountHit != null || /^(money|cash|rs|rupees)?$/i.test(thing);
    const money = formatMoney(amountHit?.amount ?? null, amountHit?.currency ?? ctx.currency);
    const thingTitle = thing || 'something';
    const title = isMoney
      ? lending.direction === 'lent'
        ? `${lending.person} owes me${money ? ` ${money}` : ''}`
        : `I owe ${lending.person}${money ? ` ${money}` : ''}`
      : lending.direction === 'lent'
        ? `${lending.person} has my ${thingTitle.toLowerCase()}`
        : `Borrowed ${thingTitle.toLowerCase()} from ${lending.person}`;
    return {
      ...base,
      kind: 'lending',
      title,
      categoryId: 'people',
      subcategory: `${isMoney ? 'Money' : 'Things'} ${lending.direction}`,
      dueDate: date,
      reminderDaysBefore: 0,
      person: lending.person,
      direction: lending.direction,
      lendingKind: isMoney ? 'money' : 'thing',
      thing: isMoney ? undefined : thing.charAt(0).toUpperCase() + thing.slice(1),
      followUpDate,
      confidence: isMoney ? (amountHit ? 'high' : 'medium') : thing ? 'high' : 'medium',
    };
  }

  // 2. Shopping
  if (!dateHit && !repeatHit) {
    const items = detectShopping(cur.text);
    if (items && items.length) {
      return {
        ...base,
        kind: 'shopping',
        title: items.map((i) => i.name).join(', '),
        categoryId: 'shopping',
        subcategory: items[0].listCategory,
        dueDate: null,
        reminderDaysBefore: null,
        person: null,
        shoppingItems: items,
        confidence: 'high',
      };
    }
  }

  // 3. A memory
  const rule = categorize(`${text} ${hindiHints(raw)}`);
  const isExpiry = !!rule?.expiry || /\b(expire|expiry|expiring|renew|valid\s+till|valid\s+until)/i.test(text);
  let dueDate: ISODate | null = repeatHit?.anchor ?? dateHit?.date ?? null;
  if (!dueDate && repeatHit) {
    // "RO filter change every 6 months" with no date: first due one cycle from now.
    dueDate = repeat.unit === 'day' ? today : addUnit(today, repeat.interval, repeat.unit);
  }
  let reminderDaysBefore: number | null = dueDate ? (rule?.reminder ?? 1) : null;
  if (reminderDaysBefore != null && repeat.frequency === 'daily') reminderDaysBefore = 0;
  if (reminderDaysBefore != null && repeat.unit === 'week' && reminderDaysBefore > 1) reminderDaysBefore = 1;

  let title = cleanTitle(cur.text);
  if (!title) title = cleanTitle(text) || text;
  title = titleCase(title);

  const signals = [!!rule, !!dueDate].filter(Boolean).length;
  return {
    ...base,
    kind: 'memory',
    title,
    categoryId: rule?.categoryId ?? 'personal',
    subcategory: rule?.subcategory,
    dueDate,
    reminderDaysBefore,
    person: null,
    isExpiry,
    confidence: signals === 2 ? 'high' : signals === 1 ? 'medium' : 'low',
  };
}

export const ruleParser: QuickAddParser = {
  name: 'rules',
  async parse(text, ctx) {
    return parseQuickAdd(text, ctx);
  },
};
