// Adds return days to a calendar on the phone. Pick the Gmail account's calendar
// and the events (with phone alerts, plus email reminders where supported)
// sync to Google Calendar everywhere.

import * as Calendar from 'expo-calendar';

import { at, ISODate, parseHHMM, toISO } from './core/dates';
import { tasksBetween } from './core/plan';
import { SchoolCalendar } from './core/schoolcal';
import { AppState, Settings } from './core/types';

const MARK = '[school-reminder:';

export type CalendarChoice = { id: string; label: string; email: boolean };

export async function writableCalendars(): Promise<CalendarChoice[]> {
  const perm = await Calendar.requestCalendarPermissions();
  if (!perm.granted) throw new Error('Calendar permission was not granted');
  const cals = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
  return cals
    .filter((c) => c.allowsModifications)
    .map((c) => ({
      id: c.id,
      label: `${c.title}${c.source?.name && c.source.name !== c.title ? ` (${c.source.name})` : ''}`,
      email: (c.allowedReminders ?? []).includes(Calendar.AlarmMethod.EMAIL),
    }))
    .sort((a, b) => Number(b.label.includes('@')) - Number(a.label.includes('@')) || a.label.localeCompare(b.label));
}

function signature(parts: unknown[]): string {
  let h = 0;
  const s = JSON.stringify(parts);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Make the chosen calendar match the schedule from today to the end of the school year. */
export async function syncCalendar(s: Settings, state: AppState, cal: SchoolCalendar,
                                   today: ISODate = toISO(new Date())) {
  const cs = s.calendarSync;
  if (!cs.enabled || !cs.calendarId) return { added: 0, updated: 0, removed: 0 };
  const perm = await Calendar.getCalendarPermissions();
  if (!perm.granted) throw new Error('Calendar permission is off. Allow it in phone Settings.');
  const target = await Calendar.ExpoCalendar.get(cs.calendarId);
  const end = cal.lastDay && cal.lastDay >= today ? cal.lastDay : today;
  const eventStart = parseHHMM(cs.eventTime) ?? 8 * 60;

  const wanted = new Map<string, { sig: string; details: Record<string, unknown> }>();
  for (const t of tasksBetween(s, cal, today, end)) {
    if (s.pauseUntil && t.date <= s.pauseUntil) continue;
    if (state.tasks[t.key] === 'skipped') continue;
    const start = at(t.date, eventStart);
    const alarms: Calendar.Alarm[] = [];
    const night = parseHHMM(t.rule.nightBefore);
    const morning = parseHHMM(t.rule.morningOf);
    if (night !== null) alarms.push({ relativeOffset: -(eventStart + 24 * 60 - night), method: Calendar.AlarmMethod.ALERT });
    if (morning !== null) alarms.push({ relativeOffset: -(eventStart - morning), method: Calendar.AlarmMethod.ALERT });
    if (cs.emailReminder && night !== null) {
      alarms.push({ relativeOffset: -(eventStart + 24 * 60 - night), method: Calendar.AlarmMethod.EMAIL });
    }
    const title = `${t.rule.child || 'School'}: ${t.rule.title}`;
    const notesBody = `Cycle Day ${t.cycle}.${t.rule.items ? ` Pack ${t.rule.items}.` : ''}\nAdded by School Day Reminder.`;
    const sig = signature([title, notesBody, start.toISOString(), alarms]);
    wanted.set(t.key, {
      sig,
      details: {
        title,
        startDate: start,
        endDate: new Date(+start + 15 * 60000),
        notes: `${notesBody}\n${MARK}${t.key}:${sig}]`,
        alarms: alarms.filter((a) => a.relativeOffset! <= 0),
        allDay: false,
      },
    });
  }

  const existing = await target.listEvents(at(today, 0), at(end, 24 * 60 - 1));
  let added = 0, updated = 0, removed = 0;
  const seen = new Set<string>();
  for (const ev of existing) {
    const m = (ev.notes ?? '').match(/\[school-reminder:([^:\]]+\|[0-9-]+):([a-z0-9]+)\]/);
    if (!m) continue; // not ours
    const [, key, sig] = m;
    const w = wanted.get(key);
    if (!w || seen.has(key)) {
      await ev.delete();
      removed++;
    } else if (w.sig !== sig) {
      await ev.update(w.details);
      updated++;
    }
    seen.add(key);
  }
  for (const [key, w] of wanted) {
    if (seen.has(key)) continue;
    await target.createEvent(w.details);
    added++;
  }
  return { added, updated, removed };
}
