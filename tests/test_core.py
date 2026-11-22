from datetime import date, datetime, timedelta

import pytest

from ldr.cycle import cycle_day, school_days_with_cycle
from ldr.gcal import _event_body
from ldr.schedule import Scheduler, State, Task
from ldr.schoolcal import SchoolCalendar, builtin_events, parse_ics

ANCHOR = (date(2026, 11, 24), 3)  # parent confirmed: Tue Nov 24 is Day 3
RULE = {"id": "arin-return", "child": "Arin", "cycle_day": 3, "title": "library book return day",
        "items": "the library book and its bag", "night_before": "19:00", "morning_of": "07:00",
        "enabled": True}


@pytest.fixture
def cal():
    return SchoolCalendar(builtin_events())


@pytest.fixture
def sched(cal, tmp_path):
    return Scheduler(cal, ANCHOR, 5, [RULE], State(tmp_path / "state.json"))


def test_school_days(cal):
    assert cal.first_day == date(2026, 9, 8)
    assert cal.last_day == date(2027, 6, 29)
    assert not cal.is_school_day(date(2026, 11, 13))   # PA day
    assert not cal.is_school_day(date(2026, 12, 25))   # winter break
    assert not cal.is_school_day(date(2027, 3, 17))    # March break
    assert not cal.is_school_day(date(2026, 11, 28))   # Saturday
    assert cal.is_school_day(date(2027, 6, 29))        # last day is a school day
    assert not cal.is_school_day(date(2027, 7, 5))     # summer
    assert cal.next_school_day(date(2026, 12, 19)) == date(2027, 1, 4)


def test_anchor_matches_first_day_as_day_1(cal):
    # Counting from Day 1 on Sep 8 lands on Day 3 on Nov 24: the anchor is consistent.
    assert cycle_day(cal, *ANCHOR, 5, date(2026, 9, 8)) == 1


def test_cycle_sequence_skips_days_off(cal):
    days = dict(school_days_with_cycle(cal, *ANCHOR, 5, date(2026, 11, 23), date(2026, 12, 1)))
    assert days == {date(2026, 11, 23): 2, date(2026, 11, 24): 3, date(2026, 11, 25): 4,
                    date(2026, 11, 26): 5, date(2026, 11, 27): 1, date(2026, 11, 30): 2,
                    date(2026, 12, 1): 3}
    # The day after winter break continues the cycle.
    before = cycle_day(cal, *ANCHOR, 5, date(2026, 12, 18))
    after = cycle_day(cal, *ANCHOR, 5, date(2027, 1, 4))
    assert after == before % 5 + 1


def test_snow_day_resumes_cycle():
    cal = SchoolCalendar(builtin_events(), extra_closures=[date(2026, 11, 25)])
    assert cycle_day(cal, *ANCHOR, 5, date(2026, 11, 25)) is None
    assert cycle_day(cal, *ANCHOR, 5, date(2026, 11, 26)) == 4


def test_ics_parsing_matches_builtin():
    ics = "BEGIN:VCALENDAR\r\n"
    for s, e, n in [("20261221", "20270102", "Winter Break"), ("20260908", "20260909", "First Day of Classes")]:
        ics += f"BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:{s}\r\nDTEND;VALUE=DATE:{e}\r\nSUMMARY:{n}\r\nEND:VEVENT\r\n"
    ics += "END:VCALENDAR\r\n"
    ev = {e.name: e for e in parse_ics(ics)}
    assert ev["Winter Break"].start == date(2026, 12, 21)
    assert ev["Winter Break"].end == date(2027, 1, 1)
    assert not ev["First Day of Classes"].is_day_off


def test_night_and_morning_reminders(sched):
    assert sched.due(datetime(2026, 11, 23, 18, 59)) == []
    due = sched.due(datetime(2026, 11, 23, 19, 0))
    assert [(r.kind, r.task.day, late) for r, late in due] == [("night", date(2026, 11, 24), False)]
    heading, text = due[0][0].message()
    assert text == "Tomorrow is Arin's library book return day (Day 3). Please pack the library book and its bag tonight."
    sched.state.set_reminder(due[0][0].key, sent="x")
    assert sched.due(datetime(2026, 11, 23, 19, 30)) == []
    due = sched.due(datetime(2026, 11, 24, 7, 0))
    assert [(r.kind, late) for r, late in due] == [("morning", False)]
    assert due[0][0].message()[1].startswith("Today is Arin's")


def test_packed_cancels_morning(sched):
    task_key = "arin-return|2026-11-24"
    sched.state.set_task(task_key, "packed")
    assert sched.due(datetime(2026, 11, 24, 7, 0)) == []


def test_missed_overnight_shows_only_morning_as_late(sched):
    due = sched.due(datetime(2026, 11, 24, 8, 15))  # PC was off from 6 PM to 8 AM
    assert [(r.kind, late) for r, late in due] == [("morning", True)]
    assert due[0][0].message(late=True)[0] == "Missed reminder"


def test_night_before_after_weekend(sched):
    # Day 3 falls on Tue Dec 1 too; and some Day 3s fall on Mondays: the reminder
    # fires the evening before (Sunday), named by weekday if it's further away.
    monday_tasks = [t for t in sched.tasks_between(date(2026, 9, 8), date(2027, 6, 29)) if t.day.weekday() == 0]
    assert monday_tasks
    t = monday_tasks[0]
    night = sched.reminders_for(t)[0]
    assert night.fire_at == datetime.combine(t.day - timedelta(days=1), datetime.min.time()).replace(hour=19)


def test_pause(cal, tmp_path):
    s = Scheduler(cal, ANCHOR, 5, [RULE], State(tmp_path / "s.json"), pause_until=date(2026, 11, 30))
    assert s.due(datetime(2026, 11, 23, 19, 0)) == []


def test_google_event_reminder_minutes():
    body = _event_body(Task(RULE, date(2026, 11, 24), 3), "08:00")
    mins = sorted(o["minutes"] for o in body["reminders"]["overrides"])
    assert mins == [60, 13 * 60]  # 7:00 AM same day, 7:00 PM night before
    assert body["summary"] == "Arin: library book return day"
    assert body["extendedProperties"]["private"]["key"] == "arin-return|2026-11-24"
