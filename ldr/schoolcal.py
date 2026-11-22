"""School-year calendar: which dates are school days.

The data comes from an ICS feed of PA days, holidays and breaks (by default the
DDSB elementary feed published by heyschool.ca). A copy is cached locally and a
built-in copy of the 2026-27 calendar is used when nothing else is available.
"""

from __future__ import annotations

import re
import urllib.request
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

DEFAULT_CALENDAR_URL = (
    "https://heyschool.ca/calendars/ics/durham-district-school-board-elementary.ics"
)

# DDSB Elementary 2026-27, from the heyschool.ca feed (checked Nov 22, 2026).
# Format: start, end (inclusive), name.
BUILTIN_2026_27 = [
    ("2026-09-02", "2026-09-02", "PA Day"),
    ("2026-09-03", "2026-09-03", "PA Day"),
    ("2026-09-04", "2026-09-04", "Board Designated Holiday"),
    ("2026-09-07", "2026-09-07", "Labour Day"),
    ("2026-09-08", "2026-09-08", "First Day of Classes"),
    ("2026-10-12", "2026-10-12", "Thanksgiving Day"),
    ("2026-10-26", "2026-10-26", "PA Day"),
    ("2026-11-13", "2026-11-13", "PA Day"),
    ("2026-12-21", "2027-01-01", "Winter Break"),
    ("2027-01-22", "2027-01-22", "PA Day - Elementary"),
    ("2027-02-15", "2027-02-15", "Family Day"),
    ("2027-03-15", "2027-03-19", "March Break"),
    ("2027-03-26", "2027-03-26", "Good Friday"),
    ("2027-03-29", "2027-03-29", "Easter Monday"),
    ("2027-05-24", "2027-05-24", "Victoria Day"),
    ("2027-06-04", "2027-06-04", "PA Day - Elementary"),
    ("2027-06-29", "2027-06-29", "Last Day of Classes for Elementary Students"),
    ("2027-06-30", "2027-06-30", "PA Day"),
]

# Entries that mark a school day rather than a day off.
_SCHOOL_DAY_MARKERS = re.compile(r"first day|last day|classes resume|semester|evaluation", re.I)
_FIRST_DAY = re.compile(r"first day of classes", re.I)
_LAST_DAY = re.compile(r"last day of classes", re.I)


@dataclass(frozen=True)
class CalEvent:
    start: date
    end: date  # inclusive
    name: str

    @property
    def is_day_off(self) -> bool:
        return not _SCHOOL_DAY_MARKERS.search(self.name)


class SchoolCalendar:
    def __init__(self, events: list[CalEvent], extra_closures: list[date] | None = None):
        self.events = sorted(events, key=lambda e: e.start)
        self.extra_closures = set(extra_closures or [])
        self._days_off: dict[date, str] = {}
        for ev in self.events:
            if ev.is_day_off:
                d = ev.start
                while d <= ev.end:
                    self._days_off[d] = ev.name
                    d += timedelta(days=1)
        for d in self.extra_closures:
            self._days_off.setdefault(d, "School closure")
        firsts = [e.start for e in self.events if _FIRST_DAY.search(e.name)]
        lasts = [e.start for e in self.events if _LAST_DAY.search(e.name)]
        # A feed can span several school years; keep (first, last) pairs.
        self.years: list[tuple[date, date]] = []
        for f in sorted(firsts):
            later = [x for x in sorted(lasts) if x > f]
            if later:
                self.years.append((f, later[0]))

    # -- queries -----------------------------------------------------------
    @property
    def first_day(self) -> date | None:
        return self.years[0][0] if self.years else None

    @property
    def last_day(self) -> date | None:
        return self.years[-1][1] if self.years else None

    def in_school_year(self, d: date) -> bool:
        return any(f <= d <= l for f, l in self.years)

    def day_off_reason(self, d: date) -> str | None:
        if d.weekday() >= 5:
            return "Weekend"
        if not self.in_school_year(d):
            return "Summer / outside school year"
        return self._days_off.get(d)

    def is_school_day(self, d: date) -> bool:
        return self.day_off_reason(d) is None

    def next_school_day(self, d: date) -> date | None:
        """First school day on or after d."""
        if self.last_day is None:
            return None
        while d <= self.last_day:
            if self.is_school_day(d):
                return d
            d += timedelta(days=1)
        return None

    def breaks_between(self, start: date, end: date) -> list[CalEvent]:
        """Named days off (holidays, PA days, breaks) overlapping [start, end]."""
        return [e for e in self.events if e.is_day_off and e.end >= start and e.start <= end]


# -- ICS parsing -------------------------------------------------------------
def _parse_date(value: str) -> date:
    v = value.strip()[:8]
    return date(int(v[:4]), int(v[4:6]), int(v[6:8]))


def parse_ics(text: str) -> list[CalEvent]:
    # Unfold continuation lines (RFC 5545).
    text = re.sub(r"\r?\n[ \t]", "", text)
    events: list[CalEvent] = []
    cur: dict[str, str] | None = None
    for line in text.splitlines():
        if line == "BEGIN:VEVENT":
            cur = {}
        elif line == "END:VEVENT" and cur is not None:
            if "DTSTART" in cur and "SUMMARY" in cur:
                start = _parse_date(cur["DTSTART"])
                if "DTEND" in cur:
                    end = _parse_date(cur["DTEND"]) - timedelta(days=1)  # DTEND is exclusive
                    end = max(end, start)
                else:
                    end = start
                name = cur["SUMMARY"].replace("\\,", ",").replace("\\;", ";")
                events.append(CalEvent(start, end, name))
            cur = None
        elif cur is not None and ":" in line:
            key, _, value = line.partition(":")
            cur[key.split(";")[0].upper()] = value
    return events


def builtin_events() -> list[CalEvent]:
    return [
        CalEvent(date.fromisoformat(s), date.fromisoformat(e), n) for s, e, n in BUILTIN_2026_27
    ]


def download(url: str, dest: Path, timeout: float = 20) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": "LibraryDayReminder/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = resp.read()
    text = data.decode("utf-8", errors="replace")
    if "BEGIN:VCALENDAR" not in text or not parse_ics(text):
        raise ValueError("Downloaded file is not a usable school calendar")
    tmp = dest.with_suffix(".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(dest)


def load_events(cache: Path) -> tuple[list[CalEvent], str]:
    """Events from the cached feed merged with the built-in copy, plus a source label."""
    events: list[CalEvent] = []
    source = "built-in 2026-27 calendar"
    if cache.exists():
        try:
            events = parse_ics(cache.read_text(encoding="utf-8"))
            source = "downloaded calendar"
        except OSError:
            events = []
    # Add built-in dates for any school year the downloaded feed doesn't cover.
    feed_years = {_school_year(e.start) for e in events}
    events += [ev for ev in builtin_events() if _school_year(ev.start) not in feed_years]
    return events, source


def _school_year(d: date) -> int:
    """School year a date belongs to, named by its starting calendar year."""
    return d.year if d.month >= 8 else d.year - 1
