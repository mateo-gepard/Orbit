import { describe, expect, it } from 'vitest';
import { notificationDeliveryPolicy } from './notification-delivery-policy';

const base = {
  accountId: 'user-one',
  itemsReady: true,
  localOnly: false,
  notificationsEnabled: true,
  habitRemindersEnabled: true,
};

describe('notificationDeliveryPolicy', () => {
  it('runs habit reminders for a cloud account without starting local briefings', () => {
    expect(notificationDeliveryPolicy(base)).toEqual({
      localBriefings: false,
      foregroundHabitReminders: true,
    });
  });

  it('runs both local products for a ready local-only account', () => {
    expect(notificationDeliveryPolicy({ ...base, localOnly: true })).toEqual({
      localBriefings: true,
      foregroundHabitReminders: true,
    });
  });

  it('does not read stale items before the active account has loaded', () => {
    expect(notificationDeliveryPolicy({ ...base, itemsReady: false })).toEqual({
      localBriefings: false,
      foregroundHabitReminders: false,
    });
  });

  it('stops all local delivery synchronously when notifications are disabled or signed out', () => {
    expect(notificationDeliveryPolicy({ ...base, notificationsEnabled: false })).toEqual({
      localBriefings: false,
      foregroundHabitReminders: false,
    });
    expect(notificationDeliveryPolicy({ ...base, accountId: null })).toEqual({
      localBriefings: false,
      foregroundHabitReminders: false,
    });
  });

  it('keeps cloud habit delivery off when its dedicated preference is off', () => {
    expect(notificationDeliveryPolicy({ ...base, habitRemindersEnabled: false })).toEqual({
      localBriefings: false,
      foregroundHabitReminders: false,
    });
  });
});
