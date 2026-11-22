import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addDays, toISO } from '../src/core/dates';
import { cycleDay, isFirstDayBack, planNotifications, recordPackedTap, schoolDaysWithCycle, suggestion,
         tasksBetween } from '../src/core/plan';
import { BUILTIN_EVENTS, parseICS, SchoolCalendar } from '../src/core/schoolcal';
import { DEFAULT_SETTINGS, EMPTY_STATE, Settings } from '../src/core/types';

const cal = new SchoolCalendar(BUILTIN_EVENTS);
const S: Settings = { ...DEFAULT_SETTINGS, weeklyPreview: { ...DEFAULT_SETTINGS.weeklyPreview, enabled: false } };
const A = S.anchor;

test('school days', () => {
  assert.equal(cal.firstDay, '2026-09-08');
  assert.equal(cal.lastDay, '2027-06-29');
  assert.equal(cal.isSchoolDay('2026-11-13'), false); // PA day
  assert.equal(cal.isSchoolDay('2026-12-25'), false);
  assert.equal(cal.isSchoolDay('2027-03-17'), false);
  assert.equal(cal.isSchoolDay('2026-11-28'), false); // Saturday
  assert.equal(cal.isSchoolDay('2027-06-29'), true);
  assert.equal(cal.nextSchoolDay('2026-12-19'), '2027-01-04');
});

test('anchor Tue Nov 24 = Day 3 means Sep 8 was Day 1', () => {
  assert.equal(cycleDay(cal, A, 5, '2026-09-08'), 1);
});

test('cycle sequence', () => {
  const days = Object.fromEntries(schoolDaysWithCycle(cal, A, 5, '2026-11-23', '2026-12-01'));
  assert.deepEqual(days, { '2026-11-23': 2, '2026-11-24': 3, '2026-11-25': 4, '2026-11-26': 5,
                           '2026-11-27': 1, '2026-11-30': 2, '2026-12-01': 3 });
});

test('snow day resumes the cycle', () => {
  const c = new SchoolCalendar(BUILTIN_EVENTS, ['2026-11-25']);
  assert.equal(cycleDay(c, A, 5, '2026-11-25'), null);
  assert.equal(cycleDay(c, A, 5, '2026-11-26'), 4);
});

test('ics parsing', () => {
  const ics = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261221\r\nDTEND;VALUE=DATE:20270102\r\n' +
    'SUMMARY:Winter Break\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
  assert.deepEqual(parseICS(ics), [{ start: '2026-12-21', end: '2027-01-01', name: 'Winter Break' }]);
});

test('notification plan for Nov 24', () => {
  const now = new Date(2026, 10, 22, 12, 0);
  const plan = planNotifications(S, EMPTY_STATE, cal, now).filter((p) => p.taskKey === 'arin-return|2026-11-24');
  assert.deepEqual(plan.map((p) => [p.kind, toISO(p.at), p.at.getHours(), p.at.getMinutes()]),
    [['night', '2026-11-23', 19, 0], ['morning', '2026-11-24', 7, 0], ['followup', '2026-11-24', 7, 20]]);
  assert.equal(plan[0].body, "Tomorrow is Arin's library book return day (Day 3). Please pack the library book and its bag tonight.");
});

test('packed task gets no notifications', () => {
  const now = new Date(2026, 10, 22, 12, 0);
  const st = { ...EMPTY_STATE, tasks: { 'arin-return|2026-11-24': 'packed' as const } };
  assert.equal(planNotifications(S, st, cal, now).some((p) => p.taskKey === 'arin-return|2026-11-24'), false);
});

test('first day back after winter break gets a heads-up', () => {
  assert.equal(isFirstDayBack(cal, '2027-01-04'), true);
  assert.equal(isFirstDayBack(cal, '2026-11-30'), false); // normal weekend
  // Make Day 3 fall on Jan 4 by anchoring there.
  const s2 = { ...S, anchor: { date: '2027-01-04', day: 3 } };
  const plan = planNotifications(s2, EMPTY_STATE, cal, new Date(2026, 11, 30, 9, 0));
  const kinds = plan.filter((p) => p.taskKey?.endsWith('2027-01-04')).map((p) => p.kind);
  assert.deepEqual(kinds, ['headsup', 'night', 'morning', 'followup']);
});

test('weekly preview lists the coming week', () => {
  const s2 = { ...DEFAULT_SETTINGS };
  const plan = planNotifications(s2, EMPTY_STATE, cal, new Date(2026, 10, 22, 12, 0));
  const w = plan.find((p) => p.kind === 'weekly');
  assert.ok(w);
  assert.equal(toISO(w!.at), '2026-11-22');
  assert.match(w!.body, /Tue: Arin library book return day/);
});

test('pause skips reminders', () => {
  const s2 = { ...S, pauseUntil: '2026-11-30' };
  const plan = planNotifications(s2, EMPTY_STATE, cal, new Date(2026, 10, 22, 12, 0));
  assert.equal(plan.some((p) => p.taskKey === 'arin-return|2026-11-24'), false);
});

test('smart suggestion learns the usual packing time', () => {
  let st = EMPTY_STATE;
  for (const m of [20 * 60 + 35, 20 * 60 + 45, 20 * 60 + 40]) {
    st = recordPackedTap(st, 'arin-return', new Date(2026, 10, 1, Math.floor(m / 60), m % 60));
  }
  const sug = suggestion(S.rules[0], st);
  assert.ok(sug);
  assert.equal(sug!.time, '20:25');
  assert.equal(suggestion(S.rules[0], { ...st, dismissedSuggestions: { 'arin-return': '20:25' } }), null);
});

test('one return day per cycle for the whole year', () => {
  const tasks = tasksBetween(S, cal, '2026-09-08', '2027-06-29');
  assert.ok(tasks.length >= 36 && tasks.length <= 38, String(tasks.length));
  for (let i = 1; i < tasks.length; i++) assert.ok(tasks[i].date > tasks[i - 1].date);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});
