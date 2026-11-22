import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { Planned } from './core/plan';

export const CATEGORY = 'school-task';
export const ACTION_PACKED = 'packed';
export const ACTION_SNOOZE = 'snooze';
const CHANNEL = 'reminders';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function setupNotifications(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'School reminders',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  }
  await Notifications.setNotificationCategoryAsync(CATEGORY, [
    { identifier: ACTION_PACKED, buttonTitle: '✅ Packed', options: { opensAppToForeground: true } },
    { identifier: ACTION_SNOOZE, buttonTitle: 'Snooze 30 min', options: { opensAppToForeground: true } },
  ]);
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  const req = await Notifications.requestPermissionsAsync();
  return req.granted;
}

/** Replace every scheduled notification with the given plan. */
export async function applyPlan(plan: Planned[]): Promise<number> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const p of plan) {
    await Notifications.scheduleNotificationAsync({
      identifier: p.id,
      content: {
        title: p.title,
        body: p.body,
        data: { taskKey: p.taskKey, kind: p.kind },
        categoryIdentifier: p.taskKey ? CATEGORY : undefined,
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: p.at, channelId: CHANNEL },
    });
  }
  return plan.length;
}

export async function snooze(title: string, body: string, data: Record<string, unknown>, minutes = 30) {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data, categoryIdentifier: CATEGORY },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(Date.now() + minutes * 60000),
      channelId: CHANNEL,
    },
  });
}

export async function showNow(title: string, body: string, data: Record<string, unknown> = {}) {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data, categoryIdentifier: data.taskKey ? CATEGORY : undefined },
    trigger: null,
  });
}
