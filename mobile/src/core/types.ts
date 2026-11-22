import { ISODate } from './dates';
import { DEFAULT_CALENDAR_URL } from './schoolcal';

export type Rule = {
  id: string;
  child: string;
  cycleDay: number;
  title: string; // "library book return day"
  items: string; // "the library book and its bag"
  nightBefore: string; // "19:00" or "" (off)
  morningOf: string; // "07:00" or "" (off)
  followUp: boolean; // extra "last call" nudge if not marked packed
  enabled: boolean;
};

export type Settings = {
  schoolName: string;
  calendarUrl: string;
  cycleLength: number;
  anchor: { date: ISODate; day: number };
  anchorConfirmed: boolean;
  extraClosures: ISODate[];
  rules: Rule[];
  pauseUntil: ISODate | null;
  weeklyPreview: { enabled: boolean; weekday: number; time: string }; // weekday 0 = Sunday
  breakHeadsUp: boolean;
  followUpMinutes: number;
  smartSuggestions: boolean;
  calendarSync: {
    enabled: boolean;
    calendarId: string | null;
    calendarLabel: string;
    eventTime: string;
    emailReminder: boolean;
  };
};

export type TaskStatus = 'packed' | 'skipped';

export type LogEntry = { at: string; text: string };

export type AppState = {
  tasks: Record<string, TaskStatus>; // key "ruleId|date"
  packedAt: Record<string, number[]>; // ruleId -> minutes after midnight of evening "Packed" taps
  dismissedSuggestions: Record<string, string>; // ruleId -> suggested time that was dismissed
  calendarFetchedAt: string | null;
  calendarSyncedAt: string | null;
  log: LogEntry[];
};

export const DEFAULT_SETTINGS: Settings = {
  schoolName: 'DDSB Elementary',
  calendarUrl: DEFAULT_CALENDAR_URL,
  cycleLength: 5,
  anchor: { date: '2026-11-24', day: 3 },
  anchorConfirmed: false,
  extraClosures: [],
  rules: [
    {
      id: 'arin-return',
      child: 'Arin',
      cycleDay: 3,
      title: 'library book return day',
      items: 'the library book and its bag',
      nightBefore: '19:00',
      morningOf: '07:00',
      followUp: true,
      enabled: true,
    },
  ],
  pauseUntil: null,
  weeklyPreview: { enabled: true, weekday: 0, time: '18:00' },
  breakHeadsUp: true,
  followUpMinutes: 20,
  smartSuggestions: true,
  calendarSync: {
    enabled: false,
    calendarId: null,
    calendarLabel: '',
    eventTime: '08:00',
    emailReminder: true,
  },
};

export const EMPTY_STATE: AppState = {
  tasks: {},
  packedAt: {},
  dismissedSuggestions: {},
  calendarFetchedAt: null,
  calendarSyncedAt: null,
  log: [],
};

export function newRule(): Rule {
  return {
    id: Math.random().toString(36).slice(2, 10),
    child: '',
    cycleDay: 1,
    title: 'library day',
    items: 'library books',
    nightBefore: '19:00',
    morningOf: '07:00',
    followUp: true,
    enabled: true,
  };
}
