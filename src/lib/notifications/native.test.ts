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
      if (n.type === 'reminder') expect([n.at.getHours(), n.at.getMinutes()]).toEqual([9, 30]);
    }
    const times = plan.map((n) => n.at.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(new Set(plan.map((n) => n.id)).size).toBe(plan.length);
  });

  it('skips completed items and closed lendings', () => {
    const done = { ...data, memories: data.memories.map((m) => ({ ...m, status: 'completed' as const })), lendings: data.lendings.map((l) => ({ ...l, status: 'returned' as const })) };
    expect(planLocalNotifications(done, settings, new Date())).toEqual([]);
  });

  it('alerts at each dose time of a daily medicine for the next week', () => {
    const now = new Date(2026, 9, 7, 10, 0);
    const today = '2026-10-07';
    const med = { ...data.memories[0], id: 'med1', title: 'Metformin', categoryId: 'health' as const, subcategory: 'Medicines', status: 'active' as const, dueDate: today, dueTimes: ['09:00', '21:00'] };
    const d = { ...data, memories: [med], reminders: [], lendings: [], recurrences: [{ id: 'rc', userId: 'u1', memoryId: 'med1', frequency: 'daily' as const, interval: 1, unit: 'day' as const, createdAt: '' }] };
    const plan = planLocalNotifications(d, settings, now);
    // Today 9 am has passed: 21:00 today, then both doses on each of the next 7 days.
    expect(plan[0].at).toEqual(new Date(2026, 9, 7, 21, 0));
    expect(plan[0].title).toBe('💊 Time for Metformin');
    expect(plan.length).toBe(1 + 7 * 2);
    expect(plan.every((n) => n.type === 'timed')).toBe(true);
  });

  it('keeps tonight’s dose after this morning’s was ticked off', () => {
    const now = new Date(2026, 9, 7, 10, 0);
    const med = { ...data.memories[0], id: 'med1', categoryId: 'health' as const, subcategory: 'Medicines', status: 'active' as const, dueDate: '2026-10-08', dueTimes: ['09:00', '21:00'], lastCompletedAt: new Date(2026, 9, 7, 9, 5).toISOString() };
    const d = { ...data, memories: [med], reminders: [], lendings: [], recurrences: [{ id: 'rc', userId: 'u1', memoryId: 'med1', frequency: 'daily' as const, interval: 1, unit: 'day' as const, createdAt: '' }] };
    expect(planLocalNotifications(d, settings, now)[0].at).toEqual(new Date(2026, 9, 7, 21, 0));
  });

  it('alerts once at the time of a one-off meeting', () => {
    const now = new Date(2026, 9, 7, 10, 0);
    const meet = { ...data.memories[0], id: 'm1', title: 'Team meeting', status: 'active' as const, dueDate: '2026-10-09', dueTimes: ['16:30'], location: 'Office' };
    const plan = planLocalNotifications({ ...data, memories: [meet], reminders: [], lendings: [], recurrences: [] }, settings, now);
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ title: 'Team meeting', body: 'At 4:30 pm · Office', type: 'timed' });
    expect(plan[0].at).toEqual(new Date(2026, 9, 9, 16, 30));
  });

  it('gives stable positive 32-bit ids', () => {
    expect(notificationId('r:1:2026-10-10')).toBe(notificationId('r:1:2026-10-10'));
    expect(notificationId('r:1:2026-10-10')).not.toBe(notificationId('r:1:2027-10-10'));
    expect(notificationId('x')).toBeGreaterThan(0);
    expect(notificationId('x')).toBeLessThan(2 ** 31);
  });
});
