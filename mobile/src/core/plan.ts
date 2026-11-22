// Cycle days, tasks, the notification plan and smart suggestions. Pure logic, no device APIs.

import { addDays, at, daysBetween, hhmm, ISODate, niceTime, parseHHMM, shortDate, toISO, weekday } from './dates';
import { SchoolCalendar } from './schoolcal';
import { AppState, Rule, Settings } from './types';

export type Anchor = { date: ISODate; day: number };

export function cycleDay(cal: SchoolCalendar, anchor: Anchor, length: number, d: ISODate): number | null {
  if (!cal.isSchoolDay(d)) return null;
  const a = cal.isSchoolDay(anchor.date) ? anchor.date : cal.nextSchoolDay(anchor.date);
  if (!a) return null;
  let steps = 0;
  if (d >= a) {
    for (let x = a; x < d; ) {
      x = addDays(x, 1);
      if (cal.isSchoolDay(x)) steps++;
    }
  } else {
    for (let x = a; x > d; ) {
      x = addDays(x, -1);
      if (cal.isSchoolDay(x)) steps--;
    }
  }
  return ((((anchor.day - 1 + steps) % length) + length) % length) + 1;
}

export function schoolDaysWithCycle(cal: SchoolCalendar, anchor: Anchor, length: number,
                                    start: ISODate, end: ISODate): [ISODate, number][] {
  const out: [ISODate, number][] = [];
  const first = cal.nextSchoolDay(start);
  if (!first || first > end) return out;
  let day = cycleDay(cal, anchor, length, first)!;
  for (let d = first; d <= end; d = addDays(d, 1)) {
    if (cal.isSchoolDay(d)) {
      out.push([d, day]);
      day = (day % length) + 1;
    }
  }
  return out;
}

export type Task = { rule: Rule; date: ISODate; cycle: number; key: string };

export function tasksBetween(s: Settings, cal: SchoolCalendar, start: ISODate, end: ISODate): Task[] {
  const rules = s.rules.filter((r) => r.enabled);
  const out: Task[] = [];
  for (const [d, c] of schoolDaysWithCycle(cal, s.anchor, s.cycleLength, start, end)) {
    for (const r of rules) if (r.cycleDay === c) out.push({ rule: r, date: d, cycle: c, key: `${r.id}|${d}` });
  }
  return out;
}

export function upcoming(s: Settings, cal: SchoolCalendar, today: ISODate, count = 8, horizon = 150): Task[] {
  return tasksBetween(s, cal, today, addDays(today, horizon)).slice(0, count);
}

/** First school day after a break longer than a normal weekend. */
export function isFirstDayBack(cal: SchoolCalendar, d: ISODate): boolean {
  const prev = cal.prevSchoolDay(d);
  return prev !== null && daysBetween(prev, d) > 3;
}

const childOf = (r: Rule) => r.child || 'Your child';

export function messageFor(task: Task, kind: 'night' | 'morning' | 'followup' | 'headsup', back = false) {
  const r = task.rule;
  const what = `${childOf(r)}'s ${r.title || 'library day'} (Day ${task.cycle})`;
  const items = r.items;
  switch (kind) {
    case 'night':
      return {
        title: back ? 'School is back tomorrow' : 'Pack tonight',
        body: `Tomorrow is ${what}.${items ? ` Please pack ${items} tonight.` : ''}`,
      };
    case 'morning':
      return { title: 'Today', body: `Today is ${what}.${items ? ` Don't forget ${items}.` : ''}` };
    case 'followup':
      return {
        title: 'Last call',
        body: `${items ? `Is ${items} in the backpack? ` : ''}${what} is today. Tap Packed once it's in.`,
      };
    case 'headsup':
      return {
        title: 'Heads-up: back to school tomorrow',
        body: `First day back is ${what}.${items ? ` Find ${items} today.` : ''}`,
      };
  }
}

export type Planned = {
  id: string;
  at: Date;
  title: string;
  body: string;
  taskKey: string | null;
  kind: 'night' | 'morning' | 'followup' | 'headsup' | 'weekly';
};

/** All future notifications for the next `horizonDays`, soonest first. */
export function planNotifications(s: Settings, state: AppState, cal: SchoolCalendar, now: Date,
                                  horizonDays = 21, max = 60): Planned[] {
  const today = toISO(now);
  const end = addDays(today, horizonDays);
  const out: Planned[] = [];
  for (const t of tasksBetween(s, cal, today, end)) {
    if (s.pauseUntil && t.date <= s.pauseUntil) continue;
    if (state.tasks[t.key]) continue; // packed or skipped
    const back = isFirstDayBack(cal, t.date);
    const night = parseHHMM(t.rule.nightBefore);
    const morning = parseHHMM(t.rule.morningOf);
    const add = (kind: Planned['kind'], date: ISODate, minutes: number, m: { title: string; body: string }) =>
      out.push({ id: `${t.key}|${kind}`, at: at(date, minutes), ...m, taskKey: t.key, kind });
    if (back && s.breakHeadsUp) add('headsup', addDays(t.date, -1), 12 * 60, messageFor(t, 'headsup'));
    if (night !== null) add('night', addDays(t.date, -1), night, messageFor(t, 'night', back));
    if (morning !== null) add('morning', t.date, morning, messageFor(t, 'morning'));
    if (t.rule.followUp && morning !== null) {
      add('followup', t.date, morning + s.followUpMinutes, messageFor(t, 'followup'));
    }
  }
  if (s.weeklyPreview.enabled) {
    const time = parseHHMM(s.weeklyPreview.time) ?? 18 * 60;
    for (let d = today; d <= end; d = addDays(d, 1)) {
      if (weekday(d) !== s.weeklyPreview.weekday) continue;
      const week = tasksBetween(s, cal, addDays(d, 1), addDays(d, 7));
      if (!week.length) continue;
      const lines = week.map((t) => `${shortDate(t.date).slice(0, 3)}: ${childOf(t.rule)} ${t.rule.title}`);
      out.push({ id: `weekly|${d}`, at: at(d, time), title: 'This week', body: lines.join(' · '),
                 taskKey: null, kind: 'weekly' });
    }
  }
  return out.filter((p) => p.at > now).sort((a, b) => +a.at - +b.at).slice(0, max);
}

/** "You usually pack around 8:40 PM" -> suggest moving the night reminder later. */
export function suggestion(rule: Rule, state: AppState): { time: string; text: string } | null {
  const reminder = parseHHMM(rule.nightBefore);
  const taps = (state.packedAt[rule.id] ?? []).slice(-6);
  if (reminder === null || taps.length < 3) return null;
  const sorted = [...taps].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (median - reminder < 30) return null;
  const proposed = Math.floor((median - 15) / 5) * 5;
  const time = hhmm(proposed);
  if (state.dismissedSuggestions[rule.id] === time) return null;
  return {
    time,
    text: `You usually pack around ${niceTime(median)}. Move ${childOf(rule)}'s reminder from ` +
          `${niceTime(reminder)} to ${niceTime(proposed)}?`,
  };
}

/** Record an evening "Packed" tap for learning (only 3 PM - midnight counts). */
export function recordPackedTap(state: AppState, ruleId: string, now: Date): AppState {
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes < 15 * 60) return state;
  const prev = state.packedAt[ruleId] ?? [];
  return { ...state, packedAt: { ...state.packedAt, [ruleId]: [...prev, minutes].slice(-10) } };
}
