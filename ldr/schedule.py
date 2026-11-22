"""Reminder schedule: which reminders are due, and what has already happened.

A reminder is (rule, school date, kind) where kind is "night" (the evening
before) or "morning" (the day itself). Its status lives in state.json so a
restart never repeats or loses a reminder.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from pathlib import Path

from .cycle import cycle_day, school_days_with_cycle
from .schoolcal import SchoolCalendar

# Late reminders are still shown (as "missed") until these cut-offs.
NIGHT_DEADLINE = time(9, 0)    # on the school day itself
MORNING_DEADLINE = time(12, 0)
LATE_AFTER = timedelta(minutes=10)


def parse_hhmm(value: str) -> time | None:
    value = (value or "").strip()
    if not value:
        return None
    h, _, m = value.partition(":")
    return time(int(h), int(m or 0))


@dataclass(frozen=True)
class Task:
    rule: dict
    day: date
    cycle: int

    @property
    def key(self) -> str:
        return f"{self.rule['id']}|{self.day.isoformat()}"


@dataclass(frozen=True)
class Reminder:
    task: Task
    kind: str  # "night" | "morning"
    fire_at: datetime

    @property
    def key(self) -> str:
        return f"{self.task.key}|{self.kind}"

    @property
    def deadline(self) -> datetime:
        cut = NIGHT_DEADLINE if self.kind == "night" else MORNING_DEADLINE
        return datetime.combine(self.task.day, cut)

    def message(self, late: bool = False) -> tuple[str, str]:
        r = self.task.rule
        child = r.get("child") or "Your child"
        title = r.get("title") or "library day"
        items = r.get("items")
        when = "Tomorrow" if self.kind == "night" else "Today"
        if self.kind == "night" and self.task.day - self.fire_at.date() > timedelta(days=1):
            when = self.task.day.strftime("%A")  # e.g. Monday after a long weekend
        head = f"{when} is {child}'s {title} (Day {self.task.cycle})."
        if items:
            body = (f"Please pack {items} tonight." if self.kind == "night"
                    else f"Don't forget {items}.")
        else:
            body = ""
        heading = "Missed reminder" if late else "Library Day Reminder"
        return heading, f"{head} {body}".strip()


class State:
    """Per-reminder and per-task status: sent / packed / skipped / snoozed."""

    def __init__(self, path: Path):
        self.path = path
        self.data: dict = {"reminders": {}, "tasks": {}}
        if path.exists():
            try:
                self.data.update(json.loads(path.read_text(encoding="utf-8")))
            except (OSError, ValueError):
                pass

    def save(self) -> None:
        # Keep the file small: drop entries older than 60 days.
        cutoff = (date.today() - timedelta(days=60)).isoformat()
        for section in ("reminders", "tasks"):
            self.data[section] = {
                k: v for k, v in self.data[section].items() if k.split("|")[1] >= cutoff
            }
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.data, indent=2), encoding="utf-8")
        tmp.replace(self.path)

    def reminder(self, key: str) -> dict:
        return self.data["reminders"].get(key, {})

    def set_reminder(self, key: str, **fields) -> None:
        self.data["reminders"].setdefault(key, {}).update(fields)

    def task_status(self, key: str) -> str | None:
        return self.data["tasks"].get(key)

    def set_task(self, key: str, status: str | None) -> None:
        if status is None:
            self.data["tasks"].pop(key, None)
        else:
            self.data["tasks"][key] = status


class Scheduler:
    def __init__(self, cal: SchoolCalendar, anchor: tuple[date, int], length: int,
                 rules: list[dict], state: State, pause_until: date | None = None):
        self.cal = cal
        self.anchor = anchor
        self.length = length
        self.rules = rules
        self.state = state
        self.pause_until = pause_until

    def tasks_between(self, start: date, end: date) -> list[Task]:
        out = []
        for d, c in school_days_with_cycle(self.cal, *self.anchor, self.length, start, end):
            for r in self.rules:
                if int(r["cycle_day"]) == c:
                    out.append(Task(r, d, c))
        return out

    def upcoming(self, today: date, count: int = 5, horizon_days: int = 120) -> list[Task]:
        return self.tasks_between(today, today + timedelta(days=horizon_days))[:count]

    def cycle_of(self, d: date) -> int | None:
        return cycle_day(self.cal, *self.anchor, self.length, d)

    def reminders_for(self, task: Task) -> list[Reminder]:
        out = []
        night = parse_hhmm(task.rule.get("night_before", ""))
        morning = parse_hhmm(task.rule.get("morning_of", ""))
        if night:
            out.append(Reminder(task, "night", datetime.combine(task.day - timedelta(days=1), night)))
        if morning:
            out.append(Reminder(task, "morning", datetime.combine(task.day, morning)))
        return out

    def due(self, now: datetime) -> list[tuple[Reminder, bool]]:
        """Reminders to show now, each with a 'late' flag (missed while the PC was off)."""
        # The night-before reminder can be several days ahead (Friday for Monday,
        # or the evening before the first day back after a break).
        tasks = self.tasks_between(now.date(), now.date() + timedelta(days=5))
        out = []
        for task in tasks:
            if self.pause_until and task.day <= self.pause_until:
                continue
            if self.state.task_status(task.key) in ("packed", "skipped"):
                continue
            for rem in self.reminders_for(task):
                st = self.state.reminder(rem.key)
                if st.get("sent") and not st.get("snooze_until"):
                    continue
                fire_at = rem.fire_at
                if st.get("snooze_until"):
                    fire_at = datetime.fromisoformat(st["snooze_until"])
                if fire_at <= now <= rem.deadline:
                    out.append((rem, now - fire_at > LATE_AFTER))
        # If both night and morning are due for one task (PC was off all night),
        # show only the morning one.
        by_task: dict[str, tuple[Reminder, bool]] = {}
        for rem, late in out:
            prev = by_task.get(rem.task.key)
            if prev is None or rem.kind == "morning":
                if prev is not None:
                    self.state.set_reminder(prev[0].key, sent=now.isoformat(), superseded=True)
                by_task[rem.task.key] = (rem, late)
        return list(by_task.values())
