import AsyncStorage from '@react-native-async-storage/async-storage';

import { toISO } from './core/dates';
import { CalEvent, mergeWithBuiltin, parseICS, SchoolCalendar } from './core/schoolcal';
import { AppState, DEFAULT_SETTINGS, EMPTY_STATE, Settings } from './core/types';

const K_SETTINGS = 'settings.v1';
const K_STATE = 'state.v1';
const K_ICS = 'calendar.ics.v1';

export async function loadSettings(): Promise<Settings> {
  const raw = await AsyncStorage.getItem(K_SETTINGS);
  if (!raw) return structuredClone(DEFAULT_SETTINGS);
  try {
    const s = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...s,
      weeklyPreview: { ...DEFAULT_SETTINGS.weeklyPreview, ...s.weeklyPreview },
      calendarSync: { ...DEFAULT_SETTINGS.calendarSync, ...s.calendarSync },
    };
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export async function saveSettings(s: Settings): Promise<void> {
  await AsyncStorage.setItem(K_SETTINGS, JSON.stringify(s));
}

export async function loadState(): Promise<AppState> {
  const raw = await AsyncStorage.getItem(K_STATE);
  if (!raw) return structuredClone(EMPTY_STATE);
  try {
    return { ...EMPTY_STATE, ...JSON.parse(raw) };
  } catch {
    return structuredClone(EMPTY_STATE);
  }
}

export async function saveState(st: AppState): Promise<void> {
  // Keep it small: task statuses for the last 60 days, last 300 log lines.
  const cutoff = toISO(new Date(Date.now() - 60 * 86400000));
  const tasks = Object.fromEntries(Object.entries(st.tasks).filter(([k]) => k.split('|')[1] >= cutoff));
  await AsyncStorage.setItem(K_STATE, JSON.stringify({ ...st, tasks, log: st.log.slice(-300) }));
}

export function withLog(st: AppState, text: string): AppState {
  return { ...st, log: [...st.log, { at: new Date().toISOString(), text }] };
}

export async function loadCalendar(s: Settings): Promise<{ cal: SchoolCalendar; source: string }> {
  let events: CalEvent[] = [];
  let source = 'built-in 2026-27 calendar';
  const ics = await AsyncStorage.getItem(K_ICS);
  if (ics) {
    events = parseICS(ics);
    if (events.length) source = 'downloaded calendar';
  }
  return { cal: new SchoolCalendar(mergeWithBuiltin(events), s.extraClosures), source };
}

/** Download the school calendar feed. Throws on failure; the saved copy stays in use. */
export async function downloadCalendar(url: string): Promise<number> {
  const resp = await fetch(url, { headers: { Accept: 'text/calendar' } });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const text = await resp.text();
  const events = parseICS(text);
  if (!text.includes('BEGIN:VCALENDAR') || !events.length) throw new Error('Not a usable school calendar');
  await AsyncStorage.setItem(K_ICS, text);
  return events.length;
}
