import { describe, expect, it } from 'vitest';
import { dataKey, memoryStore } from '../data/localRepository';
import { createLocalAuth } from './localAuth';

describe('local auth', () => {
  it('sign up, sign out, sign in', async () => {
    const auth = createLocalAuth(memoryStore());
    const u = await auth.signUp('Meera', 'Meera@Example.com', 'secret123');
    expect(u.email).toBe('meera@example.com');
    expect(await auth.getCurrentUser()).toMatchObject({ id: u.id });
    await auth.signOut();
    expect(await auth.getCurrentUser()).toBeNull();
    await expect(auth.signIn('meera@example.com', 'wrongpass1')).rejects.toThrow(/don’t match/);
    expect((await auth.signIn('meera@example.com', 'secret123')).id).toBe(u.id);
  });

  it('deletes an account, its data and its sign-in', async () => {
    const kv = memoryStore();
    const auth = createLocalAuth(kv);
    const u = await auth.signUp('Meera', 'meera@example.com', 'secret123');
    kv.setItem(dataKey(u.id), '{}');
    await auth.deleteAccount();
    expect(await auth.getCurrentUser()).toBeNull();
    expect(kv.getItem(dataKey(u.id))).toBeNull();
    await expect(auth.signIn('meera@example.com', 'secret123')).rejects.toThrow();
    // The email is free again.
    expect((await auth.signUp('Meera', 'meera@example.com', 'secret123')).id).not.toBe(u.id);
  });

  it('rejects weak passwords and duplicates', async () => {
    const auth = createLocalAuth(memoryStore());
    await expect(auth.signUp('A', 'a@b.co', 'short')).rejects.toThrow();
    await auth.signUp('A', 'a@b.co', 'longenough1');
    await expect(auth.signUp('A', 'a@b.co', 'longenough1')).rejects.toThrow(/already exists/);
  });

  it('locks after repeated failures', async () => {
    const auth = createLocalAuth(memoryStore());
    await auth.signUp('A', 'a@b.co', 'longenough1');
    for (let i = 0; i < 5; i++) await expect(auth.signIn('a@b.co', 'nopenope1')).rejects.toThrow();
    await expect(auth.signIn('a@b.co', 'longenough1')).rejects.toThrow(/Too many/);
  });

  it('resets a password with a one-time link', async () => {
    const auth = createLocalAuth(memoryStore());
    await auth.signUp('A', 'a@b.co', 'longenough1');
    const { devResetLink } = await auth.requestPasswordReset('a@b.co');
    const token = new URL(devResetLink!, 'http://x').searchParams.get('token');
    await auth.resetPassword(token, 'brandnew99');
    await expect(auth.resetPassword(token, 'another99')).rejects.toThrow(/expired/);
    await auth.signOut();
    await expect(auth.signIn('a@b.co', 'brandnew99')).resolves.toBeTruthy();
  });

  it('demo login is stable', async () => {
    const kv = memoryStore();
    const a = await createLocalAuth(kv).signInDemo();
    const b = await createLocalAuth(kv).signInDemo();
    expect(a.id).toBe(b.id);
    expect(a.isDemo).toBe(true);
  });
});
