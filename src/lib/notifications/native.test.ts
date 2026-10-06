import { describe, expect, it } from 'vitest';
import { buildSeed } from '../../data/seed';
import { notificationId, planLocalNotifications } from './native';

describe('planLocalNotifications', () => {
  const data = buildSeed('u1');
  const settings = { ...data.settings!, notifications: { ...data.settings!.notifications, browser: true, digestTime: '09:30' } };

  it('schedules only future reminders at the chosen local time, soonest first, within iOS limits', () => {
    const now = new Date();
    const plan = planLocalNotifications(data, settings, now);
    expect(plan.length).toBeGreaterThan(0);
    expect(plan.length).toBeLessThanOrEqual(60);
    for (const n of plan) {
      expect(n.at.getTime()).toBeGreaterThan(now.getTime());
      expect([n.at.getHours(), n.at.getMinutes()]).toEqual([9, 30]);
    }
    const times = plan.map((n) => n.at.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(new Set(plan.map((n) => n.id)).size).toBe(plan.length);
  });

  it('skips completed items and closed lendings', () => {
    const done = { ...data, memories: data.memories.map((m) => ({ ...m, status: 'completed' as const })), lendings: data.lendings.map((l) => ({ ...l, status: 'returned' as const })) };
    expect(planLocalNotifications(done, settings, new Date())).toEqual([]);
  });

  it('gives stable positive 32-bit ids', () => {
    expect(notificationId('r:1:2026-10-10')).toBe(notificationId('r:1:2026-10-10'));
    expect(notificationId('r:1:2026-10-10')).not.toBe(notificationId('r:1:2027-10-10'));
    expect(notificationId('x')).toBeGreaterThan(0);
    expect(notificationId('x')).toBeLessThan(2 ** 31);
  });
});
