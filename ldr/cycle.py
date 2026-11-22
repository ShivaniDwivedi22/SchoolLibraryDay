"""Cycle-day calculation.

Cycle days advance by one on every school day and wrap after the last day of
the cycle. The count is anchored on a date the parent confirmed ("today is
Day 3"); unplanned closures are added as extra days off, so the cycle resumes
where it stopped. If the school skips ahead instead, the parent re-calibrates.
"""

from __future__ import annotations

from datetime import date, timedelta

from .schoolcal import SchoolCalendar


def cycle_day(cal: SchoolCalendar, anchor_date: date, anchor_day: int, length: int, d: date) -> int | None:
    """Cycle day (1..length) for date d, or None if d is not a school day."""
    if not cal.is_school_day(d):
        return None
    # The anchor itself might have been entered on a non-school day; snap it
    # forward to the next school day.
    a = cal.next_school_day(anchor_date) if not cal.is_school_day(anchor_date) else anchor_date
    if a is None:
        return None
    steps = 0
    if d >= a:
        cur = a
        while cur < d:
            cur += timedelta(days=1)
            if cal.is_school_day(cur):
                steps += 1
    else:
        cur = a
        while cur > d:
            cur -= timedelta(days=1)
            if cal.is_school_day(cur):
                steps -= 1
    return (anchor_day - 1 + steps) % length + 1


def school_days_with_cycle(cal: SchoolCalendar, anchor_date: date, anchor_day: int, length: int,
                           start: date, end: date) -> list[tuple[date, int]]:
    """All (date, cycle day) pairs for school days in [start, end]."""
    out: list[tuple[date, int]] = []
    first = cal.next_school_day(start)
    if first is None or first > end:
        return out
    day = cycle_day(cal, anchor_date, anchor_day, length, first)
    d = first
    while d <= end:
        if cal.is_school_day(d):
            out.append((d, day))
            day = day % length + 1
        d += timedelta(days=1)
    return out
