// Ties everything together: refresh the calendar, reschedule notifications,
// sync the phone calendar. Used by the app and by the background task.

import { syncCalendar } from './calendarSync';
import { toISO } from './core/dates';
import { planNotifications, recordPackedTap } from './core/plan';
import { AppState, TaskStatus } from './core/types';
import { applyPlan } from './notify';
import { downloadCalendar, loadCalendar, loadSettings, loadState, saveState, withLog } from './store';

const WEEK = 7 * 86400000;
const DAY = 86400000;

export type RefreshResult = { scheduled: number; calendarNote: string | null; warning: string | null };

export async function refreshAll(opts: { forceDownload?: boolean; forceSync?: boolean } = {}): Promise<RefreshResult> {
  const s = await loadSettings();
  let st = await loadState();
  let warning: string | null = null;

  const fetchedAt = st.calendarFetchedAt ? Date.parse(st.calendarFetchedAt) : 0;
  if (opts.forceDownload || Date.now() - fetchedAt > WEEK) {
    try {
      const n = await downloadCalendar(s.calendarUrl);
      st = withLog({ ...st, calendarFetchedAt: new Date().toISOString() }, `School calendar updated (${n} dates)`);
    } catch (e) {
      st = withLog(st, `School calendar download failed: ${(e as Error).message}`);
      if (opts.forceDownload) warning = `Could not update the school calendar: ${(e as Error).message}`;
    }
  }

  const { cal } = await loadCalendar(s);
  const today = toISO(new Date());
  if (!cal.lastDay || cal.lastDay < today) {
    warning = "The new school year's calendar isn't available yet. Check Settings > School.";
  }

  const plan = planNotifications(s, st, cal, new Date());
  const scheduled = await applyPlan(plan);

  let calendarNote: string | null = null;
  const syncedAt = st.calendarSyncedAt ? Date.parse(st.calendarSyncedAt) : 0;
  if (s.calendarSync.enabled && (opts.forceSync || Date.now() - syncedAt > DAY)) {
    try {
      const r = await syncCalendar(s, st, cal);
      calendarNote = `Calendar: ${r.added} added, ${r.updated} updated, ${r.removed} removed`;
      st = withLog({ ...st, calendarSyncedAt: new Date().toISOString() }, calendarNote);
    } catch (e) {
      calendarNote = `Calendar sync failed: ${(e as Error).message}`;
      st = withLog(st, calendarNote);
      warning = warning ?? calendarNote;
    }
  }
  await saveState(st);
  return { scheduled, calendarNote, warning };
}

export async function setTaskStatus(taskKey: string, status: TaskStatus | null, label: string): Promise<AppState> {
  let st = await loadState();
  const tasks = { ...st.tasks };
  if (status) tasks[taskKey] = status;
  else delete tasks[taskKey];
  st = { ...st, tasks };
  if (status === 'packed') st = recordPackedTap(st, taskKey.split('|')[0], new Date());
  st = withLog(st, `${label}: ${status ?? 'reset'}`);
  await saveState(st);
  await refreshAll();
  return st;
}
