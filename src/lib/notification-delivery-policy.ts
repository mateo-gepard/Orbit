export interface NotificationDeliveryPolicyInput {
  accountId: string | null;
  itemsReady: boolean;
  localOnly: boolean;
  notificationsEnabled: boolean;
  habitRemindersEnabled: boolean;
}

export interface NotificationDeliveryPolicy {
  /** Browser/service-worker briefing fallback for the local-only profile. */
  localBriefings: boolean;
  /** Per-habit notifications evaluated from the active tab's in-memory items. */
  foregroundHabitReminders: boolean;
}

/**
 * Keep the two delivery products explicit.
 *
 * Cloud accounts receive morning/evening briefings from the bounded server
 * push queue. Habit reminders need the current item state and are deliberately
 * evaluated only in an open, owner-scoped client; treating the two as one
 * scheduler would duplicate cloud briefings and falsely imply background habit
 * delivery.
 */
export function notificationDeliveryPolicy({
  accountId,
  itemsReady,
  localOnly,
  notificationsEnabled,
  habitRemindersEnabled,
}: NotificationDeliveryPolicyInput): NotificationDeliveryPolicy {
  const activeAccount = Boolean(accountId && itemsReady && notificationsEnabled);
  return {
    localBriefings: activeAccount && localOnly,
    foregroundHabitReminders: activeAccount && habitRemindersEnabled,
  };
}
