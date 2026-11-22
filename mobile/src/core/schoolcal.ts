// School-year calendar: which dates are school days.
// Data: an ICS feed of PA days, holidays and breaks (default: DDSB elementary
// feed from heyschool.ca), with a built-in 2026-27 copy as fallback.

import { addDays, ISODate, weekday } from './dates';

export const DEFAULT_CALENDAR_URL =
  'https://heyschool.ca/calendars/ics/durham-district-school-board-elementary.ics';

export type CalEvent = { start: ISODate; end: ISODate; name: string }; // end inclusive

// DDSB Elementary 2026-27 (heyschool.ca feed, checked Nov 22, 2026).
export const BUILTIN_EVENTS: CalEvent[] = [
  { start: '2026-09-02', end: '2026-09-02', name: 'PA Day' },
  { start: '2026-09-03', end: '2026-09-03', name: 'PA Day' },
  { start: '2026-09-04', end: '2026-09-04', name: 'Board Designated Holiday' },
  { start: '2026-09-07', end: '2026-09-07', name: 'Labour Day' },
  { start: '2026-09-08', end: '2026-09-08', name: 'First Day of Classes' },
  { start: '2026-10-12', end: '2026-10-12', name: 'Thanksgiving Day' },
  { start: '2026-10-26', end: '2026-10-26', name: 'PA Day' },
  { start: '2026-11-13', end: '2026-11-13', name: 'PA Day' },
  { start: '2026-12-21', end: '2027-01-01', name: 'Winter Break' },
  { start: '2027-01-22', end: '2027-01-22', name: 'PA Day - Elementary' },
  { start: '2027-02-15', end: '2027-02-15', name: 'Family Day' },
  { start: '2027-03-15', end: '2027-03-19', name: 'March Break' },
  { start: '2027-03-26', end: '2027-03-26', name: 'Good Friday' },
  { start: '2027-03-29', end: '2027-03-29', name: 'Easter Monday' },
  { start: '2027-05-24', end: '2027-05-24', name: 'Victoria Day' },
  { start: '2027-06-04', end: '2027-06-04', name: 'PA Day - Elementary' },
  { start: '2027-06-29', end: '2027-06-29', name: 'Last Day of Classes for Elementary Students' },
  { start: '2027-06-30', end: '2027-06-30', name: 'PA Day' },
];

const SCHOOL_DAY_MARKERS = /first day|last day|classes resume|semester|evaluation/i;
const FIRST_DAY = /first day of classes/i;
const LAST_DAY = /last day of classes/i;

export const isDayOff = (e: CalEvent) => !SCHOOL_DAY_MARKERS.test(e.name);

export class SchoolCalendar {
  events: CalEvent[];
  years: [ISODate, ISODate][] = [];
  private daysOff = new Map<ISODate, string>();

  constructor(events: CalEvent[], extraClosures: ISODate[] = []) {
    this.events = [...events].sort((a, b) => a.start.localeCompare(b.start));
    for (const e of this.events) {
      if (!isDayOff(e)) continue;
      for (let d = e.start; d <= e.end; d = addDays(d, 1)) this.daysOff.set(d, e.name);
    }
    for (const d of extraClosures) if (!this.daysOff.has(d)) this.daysOff.set(d, 'School closure');
    const firsts = this.events.filter((e) => FIRST_DAY.test(e.name)).map((e) => e.start).sort();
    const lasts = this.events.filter((e) => LAST_DAY.test(e.name)).map((e) => e.start).sort();
    for (const f of firsts) {
      const l = lasts.find((x) => x > f);
      if (l) this.years.push([f, l]);
    }
  }

  get firstDay(): ISODate | null {
    return this.years.length ? this.years[0][0] : null;
  }

  get lastDay(): ISODate | null {
    return this.years.length ? this.years[this.years.length - 1][1] : null;
  }

  inSchoolYear(d: ISODate): boolean {
    return this.years.some(([f, l]) => f <= d && d <= l);
  }

  dayOffReason(d: ISODate): string | null {
    const wd = weekday(d);
    if (wd === 0 || wd === 6) return 'Weekend';
    if (!this.inSchoolYear(d)) return 'Outside the school year';
    return this.daysOff.get(d) ?? null;
  }

  isSchoolDay(d: ISODate): boolean {
    return this.dayOffReason(d) === null;
  }

  nextSchoolDay(d: ISODate): ISODate | null {
    const last = this.lastDay;
    if (!last) return null;
    for (let x = d; x <= last; x = addDays(x, 1)) if (this.isSchoolDay(x)) return x;
    return null;
  }

  prevSchoolDay(d: ISODate): ISODate | null {
    const first = this.firstDay;
    if (!first) return null;
    for (let x = addDays(d, -1); x >= first; x = addDays(x, -1)) if (this.isSchoolDay(x)) return x;
    return null;
  }

  breaksBetween(start: ISODate, end: ISODate): CalEvent[] {
    return this.events.filter((e) => isDayOff(e) && e.end >= start && e.start <= end);
  }
}

function icsDate(v: string): ISODate {
  const s = v.trim().slice(0, 8);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

export function parseICS(text: string): CalEvent[] {
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const out: CalEvent[] = [];
  let cur: Record<string, string> | null = null;
  for (const line of unfolded.split(/\r?\n/)) {
    if (line === 'BEGIN:VEVENT') cur = {};
    else if (line === 'END:VEVENT' && cur) {
      if (cur.DTSTART && cur.SUMMARY) {
        const start = icsDate(cur.DTSTART);
        let end = cur.DTEND ? addDays(icsDate(cur.DTEND), -1) : start; // DTEND is exclusive
        if (end < start) end = start;
        out.push({ start, end, name: cur.SUMMARY.replace(/\\,/g, ',').replace(/\\;/g, ';') });
      }
      cur = null;
    } else if (cur) {
      const i = line.indexOf(':');
      if (i > 0) cur[line.slice(0, i).split(';')[0].toUpperCase()] = line.slice(i + 1);
    }
  }
  return out;
}

const schoolYear = (d: ISODate) => {
  const y = Number(d.slice(0, 4));
  return Number(d.slice(5, 7)) >= 8 ? y : y - 1;
};

/** Downloaded events plus built-in ones for school years the download lacks. */
export function mergeWithBuiltin(downloaded: CalEvent[]): CalEvent[] {
  const have = new Set(downloaded.map((e) => schoolYear(e.start)));
  return [...downloaded, ...BUILTIN_EVENTS.filter((e) => !have.has(schoolYear(e.start)))];
}
