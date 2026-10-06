import { describe, expect, it } from 'vitest';
import { parseQuickAdd } from './ruleParser';

const ctx = { today: '2026-10-06', currency: 'INR' }; // a Tuesday
const p = (s: string) => parseQuickAdd(s, ctx);

describe('spec examples', () => {
  it('car insurance with full date', () => {
    const r = p('Car insurance expires 12 February 2027');
    expect(r.kind).toBe('memory');
    expect(r.title).toBe('Car Insurance');
    expect(r.categoryId).toBe('vehicle');
    expect(r.subcategory).toBe('Insurance');
    expect(r.dueDate).toBe('2027-02-12');
    expect(r.reminderDaysBefore).toBe(30);
    expect(r.isExpiry).toBe(true);
  });

  it('bike insurance with yearless date', () => {
    const r = p('Bike insurance expires on 17 November');
    expect(r.title).toBe('Bike Insurance');
    expect(r.dueDate).toBe('2026-11-17');
  });

  it('money lent today', () => {
    const r = p('I lent Rahul ₹2000 today');
    expect(r.kind).toBe('lending');
    expect(r.title).toBe('Rahul owes me ₹2,000');
    expect(r.person).toBe('Rahul');
    expect(r.amount).toBe(2000);
    expect(r.direction).toBe('lent');
    expect(r.lendingKind).toBe('money');
    expect(r.dueDate).toBe('2026-10-06');
    expect(r.followUpDate).toBe('2026-10-13');
  });

  it('recurring RO filter', () => {
    const r = p('RO filter change every 6 months');
    expect(r.title).toBe('RO Filter Change');
    expect(r.categoryId).toBe('home');
    expect(r.repeat.frequency).toBe('half_yearly');
    expect(r.dueDate).toBe('2027-04-06');
  });
});

describe('dates', () => {
  it.each([
    ['Pay rent tomorrow', '2026-10-07'],
    ['Dentist on Friday', '2026-10-09'],
    ['Passport expires in 21 days', '2026-10-27'],
    ['Renew domain next month', '2026-11-06'],
    ['Electricity bill 15/10', '2026-10-15'],
    ['Car service 2027-01-05', '2027-01-05'],
    ['Mother birthday March 14', '2027-03-14'],
    ['Wifi bill on the 20th', '2026-10-20'],
    ['Return library book day after tomorrow', '2026-10-08'],
  ])('%s', (text, date) => {
    expect(p(text).dueDate).toBe(date);
  });

  it('ignores impossible dates', () => {
    expect(p('Something on 31/02/2027').dueDate).toBeNull();
  });
});

describe('categories', () => {
  it.each([
    ['Electricity bill due 10 Oct', 'home', 'Bills'],
    ['AC service next week', 'home', 'Services'],
    ['Bike PUC expires 3 Dec', 'vehicle', 'PUC'],
    ['Netflix subscription renews on 22 Oct', 'finance', 'Subscriptions'],
    ['Health insurance premium 1 Jan', 'finance', 'Insurance'],
    ['Fridge warranty ends 2027-06-30', 'documents', 'Warranties'],
    ["Mother's birthday on 14 March", 'personal', 'Important dates'],
    ['Car service on 20 Oct', 'vehicle', 'Service'],
    ['Driving licence renewal 5 May 2027', 'documents', 'Driving licence'],
  ])('%s', (text, cat, sub) => {
    const r = p(text);
    expect(r.categoryId).toBe(cat);
    expect(r.subcategory).toBe(sub);
  });

  it('keeps amounts on bills', () => {
    const r = p('Electricity bill ₹1,450 due tomorrow');
    expect(r.amount).toBe(1450);
    expect(r.title).toBe('Electricity Bill');
  });
});

describe('repeats', () => {
  it.each([
    ['Water plants every day', 'daily'],
    ['Pay maid monthly', 'monthly'],
    ['Pest control every 3 months', 'quarterly'],
    ['Car insurance every year on 12 Feb', 'yearly'],
    ['Clean fridge every 2 weeks', 'custom'],
  ])('%s', (text, freq) => {
    expect(p(text).repeat.frequency).toBe(freq);
  });

  it('anchors "every monday"', () => {
    const r = p('Take out recycling every Monday');
    expect(r.repeat.frequency).toBe('weekly');
    expect(r.dueDate).toBe('2026-10-12');
    expect(r.title).toBe('Take Out Recycling');
  });
});

describe('lending', () => {
  it('borrowed thing', () => {
    const r = p('I borrowed a drill machine from Amit');
    expect(r.kind).toBe('lending');
    expect(r.direction).toBe('borrowed');
    expect(r.lendingKind).toBe('thing');
    expect(r.person).toBe('Amit');
    expect(r.thing).toBe('Drill machine');
  });

  it('lent with "to"', () => {
    const r = p('Lent ₹500 to priya on 1 Oct');
    expect(r.person).toBe('Priya');
    expect(r.amount).toBe(500);
    expect(r.dueDate).toBe('2026-10-01');
  });

  it('owes me, bare number', () => {
    const r = p('Sunil owes me 1500');
    expect(r.direction).toBe('lent');
    expect(r.amount).toBe(1500);
  });

  it('I owe', () => {
    const r = p('I owe Neha 2k');
    expect(r.direction).toBe('borrowed');
    expect(r.amount).toBe(2000);
    expect(r.title).toBe('I owe Neha ₹2,000');
  });

  it('follow-up from future date', () => {
    const r = p('Gave my umbrella to Karan, return by Friday');
    expect(r.lendingKind).toBe('thing');
    expect(r.person).toBe('Karan');
    expect(r.followUpDate).toBe('2026-10-09');
  });
});

describe('shopping', () => {
  it('splits items', () => {
    const r = p('Buy milk, bread and 2 kg rice');
    expect(r.kind).toBe('shopping');
    expect(r.shoppingItems?.map((i) => i.name)).toEqual(['Milk', 'Bread', 'Rice']);
    expect(r.shoppingItems?.[2].quantity).toBe('2 kg');
  });

  it('guesses lists', () => {
    const r = p('Need LED bulbs and batteries');
    expect(r.shoppingItems?.every((i) => i.listCategory === 'Home')).toBe(true);
  });

  it('dated purchases stay memories', () => {
    expect(p('Buy gift for Anu birthday on 3 Nov').kind).toBe('memory');
  });

  it('services are not shopping', () => {
    expect(p('Get the AC serviced').kind).toBe('memory');
  });
});
