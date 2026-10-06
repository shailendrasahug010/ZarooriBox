// deno test supabase/functions/_shared
import { signAction, verifyAction } from './actionToken.ts';
import { addMonths, nextOccurrenceAfter, planMemoryAction } from './reminderActions.ts';

function eq(a: unknown, b: unknown, msg = '') {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}\nexpected ${JSON.stringify(b)}\n     got ${JSON.stringify(a)}`);
}

Deno.test('action links: genuine tokens verify, tampered or expired ones do not', async () => {
  const t = await signAction('s3cret', 'user-1', { kind: 'memory', id: 'mem_1' });
  const c = await verifyAction('s3cret', t);
  eq([c?.userId, c?.kind, c?.id], ['user-1', 'memory', 'mem_1']);
  eq(await verifyAction('other', t), null, 'wrong secret');
  const [body, sig] = t.split('.');
  const forged = btoa(JSON.stringify({ u: 'user-2', k: 'm', i: 'mem_1', e: 9e9 })).replace(/=+$/, '');
  eq(await verifyAction('s3cret', `${forged}.${sig}`), null, 'changed body');
  eq(await verifyAction('s3cret', `${body}.${sig}x`), null, 'changed signature');
  eq(await verifyAction('s3cret', t, Date.now() + 31 * 86400_000), null, 'expired');
  const l = await verifyAction('s3cret', await signAction('s3cret', 'u', { kind: 'lending', id: 'len_9' }));
  eq(l?.kind, 'lending');
});

Deno.test('server dates match the app (month ends clamp)', () => {
  eq(addMonths('2026-01-31', 1), '2026-02-28');
  eq(addMonths('2027-12-15', 2), '2028-02-15');
  eq(nextOccurrenceAfter('2026-08-10', { interval: 1, unit: 'month' }, '2026-10-07'), '2026-10-10', 'overdue monthly lands on the next future date');
  eq(nextOccurrenceAfter('2026-10-07', { interval: 6, unit: 'month' }, '2026-10-07'), '2027-04-07');
});

Deno.test('Done rolls repeating items, finishes one-offs; snooze moves the reminder', () => {
  const today = '2026-10-07';
  const reminder = { id: 'r1', offset_days: 2, remind_on: '2026-10-05' };
  eq(planMemoryAction({ status: 'active', due_date: '2026-10-07', repeat: { interval: 1, unit: 'month' }, reminder }, 'done', today, 'Rent').type, 'roll');
  const roll = planMemoryAction({ status: 'active', due_date: '2026-10-07', repeat: { interval: 1, unit: 'month' }, reminder }, 'done', today, 'Rent');
  if (roll.type !== 'roll') throw new Error('expected roll');
  eq([roll.nextDue, roll.reminderOn], ['2026-11-07', '2026-11-05']);
  eq(planMemoryAction({ status: 'active', due_date: '2026-10-07', repeat: null, reminder }, 'done', today, 'Passport').type, 'complete');
  eq(planMemoryAction({ status: 'completed', due_date: '2026-10-07', repeat: null, reminder }, 'done', today, 'Passport').type, 'none');
  const z = planMemoryAction({ status: 'active', due_date: '2026-10-07', repeat: null, reminder }, 'week', today, 'Passport');
  eq(z.type === 'snooze' && z.remindOn, '2026-10-14');
});
