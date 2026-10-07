// deno test supabase/functions/_shared
import { allowedReturn, buildBackup, itemCount, openToken, sealToken, signState, skipReason, verifyState } from './driveBackup.ts';

function eq(a: unknown, b: unknown, msg = '') {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}\nexpected ${JSON.stringify(b)}\n     got ${JSON.stringify(a)}`);
}

Deno.test('drive state: genuine verifies, tampered, foreign or expired does not', async () => {
  const s = await signState('k', 'user-1', 'app', 1_000_000);
  eq((await verifyState('k', s, 1_000_000))?.userId, 'user-1');
  eq(await verifyState('other', s, 1_000_000), null, 'wrong secret');
  eq(await verifyState('k', s, 1_000_000 + 16 * 60_000), null, 'expired');
  const [, sig] = s.split('.');
  const forged = btoa(JSON.stringify({ u: 'user-2', r: 'app', e: 9e9 })).replace(/=+$/, '');
  eq(await verifyState('k', `${forged}.${sig}`, 1_000_000), null, 'forged body');
});

Deno.test('refresh tokens round-trip only with the right key', async () => {
  const sealed = await sealToken('k', '1//refresh');
  eq(sealed.includes('refresh'), false, 'not stored in the clear');
  eq(await openToken('k', sealed), '1//refresh');
  eq(await openToken('x', sealed), null);
});

Deno.test('Google may only send people back to the app or allowed sites', () => {
  const allowed = ['https://zarooribox.netlify.app'];
  eq(allowedReturn('app', allowed), true);
  eq(allowedReturn('https://zarooribox.netlify.app', allowed), true);
  eq(allowedReturn('http://localhost:5173', allowed), true);
  eq(allowedReturn('https://evil.example', allowed), false);
  eq(allowedReturn('https://zarooribox.netlify.app/app', allowed), false, 'origins only');
  eq(allowedReturn('http://zarooribox.netlify.app', allowed), false, 'https only');
  eq(allowedReturn('javascript:alert(1)', allowed), false);
});

Deno.test('backup file uses the app’s field names and counts items', () => {
  const b = buildBackup({ memories: [{ id: 'mem_1', user_id: 'u', due_times: ['09:00'] }], shopping: [{ id: 'shp_1' }] }, { user_id: 'u', default_reminder_days: 1 }, {});
  eq((b.memories as Record<string, unknown>[])[0], { id: 'mem_1', userId: 'u', dueTimes: ['09:00'] });
  eq((b.settings as Record<string, unknown>).defaultReminderDays, 1);
  eq(itemCount(b), 2);
});

Deno.test('daily backup never replaces a full backup with a near-empty account', () => {
  eq(skipReason(null, 0, false) !== null, true, 'empty account');
  eq(skipReason(40, 3, false) !== null, true, 'new phone, not restored');
  eq(skipReason(40, 38, false), null);
  eq(skipReason(40, 3, true), null, 'Back up now still works');
  eq(skipReason(2, 1, false), null, 'small backups are fine');
});
