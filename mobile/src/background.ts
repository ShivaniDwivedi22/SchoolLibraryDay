// Keeps reminders scheduled weeks ahead even if the app isn't opened:
// runs roughly twice a day (the OS decides exactly when).

import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { refreshAll } from './engine';

const TASK = 'school-reminder-refresh';

TaskManager.defineTask(TASK, async () => {
  try {
    await refreshAll();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerBackgroundRefresh() {
  const status = await BackgroundTask.getStatusAsync();
  if (status !== BackgroundTask.BackgroundTaskStatus.Available) return false;
  if (!(await TaskManager.isTaskRegisteredAsync(TASK))) {
    await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: 12 * 60 });
  }
  return true;
}
