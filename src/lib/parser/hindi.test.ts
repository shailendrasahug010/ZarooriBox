import { describe, expect, it } from 'vitest';
import { parseQuickAdd } from './ruleParser';

const ctx = { today: '2026-10-07', currency: 'INR' };

describe('Hindi and Hinglish Quick Add (offline parser)', () => {
  it('reads Hindi dates and keeps the Hindi title', () => {
    const p = parseQuickAdd('कल बिजली का बिल', ctx);
    expect(p.kind).toBe('memory');
    expect(p.dueDate).toBe('2026-10-08');
    expect(p.title).toBe('बिजली का बिल');
    expect(p.categoryId).toBe('home');
  });

  it('understands Hindi months and Devanagari digits', () => {
    const p = parseQuickAdd('१७ नवंबर को बाइक इंश्योरेंस', ctx);
    expect(p.dueDate).toBe('2026-11-17');
    expect(p.categoryId).toBe('vehicle');
  });

  it('understands repeats: हर 6 महीने, हर महीने 5 तारीख', () => {
    const ro = parseQuickAdd('हर 6 महीने RO फ़िल्टर बदलना', ctx);
    expect(ro.repeat).toMatchObject({ interval: 6, unit: 'month' });
    const rent = parseQuickAdd('हर महीने 5 तारीख को किराया', ctx);
    expect(rent.repeat).toMatchObject({ interval: 1, unit: 'month' });
    expect(rent.dueDate).toBe('2026-11-05');
  });

  it('reads lending in Hindi and Hinglish', () => {
    const a = parseQuickAdd('राहुल को 500 रुपये दिए', ctx);
    expect(a).toMatchObject({ kind: 'lending', direction: 'lent', person: 'राहुल', amount: 500, lendingKind: 'money' });
    const b = parseQuickAdd('Rahul ko 2000 diye', ctx);
    expect(b).toMatchObject({ kind: 'lending', direction: 'lent', person: 'Rahul', amount: 2000 });
    const c = parseQuickAdd('अमित से सीढ़ी ली', ctx);
    expect(c).toMatchObject({ kind: 'lending', direction: 'borrowed', person: 'अमित', lendingKind: 'thing' });
  });

  it('reads shopping lists', () => {
    const p = parseQuickAdd('दूध, ब्रेड और अंडे खरीदने हैं', ctx);
    expect(p.kind).toBe('shopping');
    expect(p.shoppingItems?.map((i) => i.name)).toEqual(['दूध', 'ब्रेड', 'अंडे']);
  });

  it('leaves English untouched', () => {
    expect(parseQuickAdd('Car insurance expires on 12 February 2027', ctx).dueDate).toBe('2027-02-12');
    expect(parseQuickAdd('Call Kalpana tomorrow', ctx).title).toBe('Call Kalpana');
  });
});

describe('Hinglish times', () => {
  it('reads subah / shaam / raat and baje', () => {
    expect(parseQuickAdd('mujhe kal subah 8 baje dawai lena hai', ctx)).toMatchObject({ title: 'Dawai', dueDate: '2026-10-08', times: ['08:00'], subcategory: 'Medicines' });
    expect(parseQuickAdd('shaam 6:30 baje doctor', ctx).times).toEqual(['18:30']);
    expect(parseQuickAdd('raat 10 baje dawai', ctx).times).toEqual(['22:00']);
    expect(parseQuickAdd('कल सुबह 9 बजे डॉक्टर', ctx)).toMatchObject({ dueDate: '2026-10-08', times: ['09:00'] });
    // Without a part of the day, 4 o'clock means the afternoon.
    expect(parseQuickAdd('kal 4 baje meeting', ctx)).toMatchObject({ title: 'Meeting', times: ['16:00'] });
  });
});
