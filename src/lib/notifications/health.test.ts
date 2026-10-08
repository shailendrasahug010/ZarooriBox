import { describe, expect, it } from 'vitest';
import { reminderChecks, type ReminderHealth } from './health';

const good: ReminderHealth = { notificationsOn: true, channelImportance: 5, exactAlarms: true, batteryUnrestricted: true, manufacturer: 'google', sdk: 35 };
const ids = (h: ReminderHealth) => Object.fromEntries(reminderChecks(h).map((c) => [c.id, c.ok]));

describe('pop-up check', () => {
  it('is all clear on a set-up Pixel', () => {
    expect(ids(good)).toEqual({ notifications: true, popup: true, exact: true, battery: true });
  });

  it('flags a quiet channel, missing exact alarms and notifications off', () => {
    expect(ids({ ...good, notificationsOn: false, channelImportance: 3, exactAlarms: false })).toMatchObject({ notifications: false, popup: false, exact: false });
  });

  it('asks Xiaomi owners to lift the battery saver and turn on Autostart', () => {
    expect(ids({ ...good, manufacturer: 'Xiaomi', batteryUnrestricted: false })).toMatchObject({ battery: false, autostart: null });
  });

  it("doesn't flag the battery saver on stock Android", () => {
    expect(ids({ ...good, batteryUnrestricted: false }).battery).toBe(true);
  });

  it('leaves the pop-up row to the person before the first reminder creates the channel', () => {
    expect(ids({ ...good, channelImportance: -1 }).popup).toBeNull();
  });
});
