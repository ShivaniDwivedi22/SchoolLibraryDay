"""Settings, stored as JSON in the app's data folder."""

from __future__ import annotations

import copy
import json
import uuid
from datetime import date
from pathlib import Path

from .schoolcal import DEFAULT_CALENDAR_URL

DEFAULTS: dict = {
    "school": "DDSB Elementary",
    "calendar_url": DEFAULT_CALENDAR_URL,
    "cycle_length": 5,
    # Confirmed cycle day on a known date. None = ask on first run.
    "anchor": {"date": "2026-11-24", "day": 3},
    "anchor_confirmed": False,
    "extra_closures": [],  # unplanned closures (snow days), "YYYY-MM-DD"
    "rules": [
        {
            "id": "arin-return",
            "child": "Arin",
            "cycle_day": 3,
            "title": "library book return day",
            "items": "the library book and its bag",
            "night_before": "19:00",
            "morning_of": "07:00",
            "enabled": True,
        },
        {
            "id": "arin-library",
            "child": "Arin",
            "cycle_day": 4,
            "title": "library day (new book comes home)",
            "items": "",
            "night_before": "",
            "morning_of": "",
            "enabled": False,
        },
    ],
    "notify_windows": True,
    "google": {"enabled": False, "calendar_name": "School reminders", "event_time": "08:00"},
    "pause_until": None,
    "autostart": True,
}


def new_rule() -> dict:
    return {
        "id": uuid.uuid4().hex[:8],
        "child": "",
        "cycle_day": 1,
        "title": "library day",
        "items": "library books",
        "night_before": "19:00",
        "morning_of": "07:00",
        "enabled": True,
    }


class Config:
    def __init__(self, path: Path):
        self.path = path
        self.data = copy.deepcopy(DEFAULTS)
        if path.exists():
            try:
                stored = json.loads(path.read_text(encoding="utf-8"))
                self.data.update(stored)
                self.data["google"] = {**DEFAULTS["google"], **stored.get("google", {})}
            except (OSError, ValueError):
                pass  # keep defaults; a broken file is replaced on next save

    def save(self) -> None:
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.data, indent=2), encoding="utf-8")
        tmp.replace(self.path)

    def __getitem__(self, key):
        return self.data[key]

    def __setitem__(self, key, value):
        self.data[key] = value

    # -- convenience -------------------------------------------------------
    @property
    def anchor(self) -> tuple[date, int] | None:
        a = self.data.get("anchor")
        if not a:
            return None
        return date.fromisoformat(a["date"]), int(a["day"])

    def set_anchor(self, d: date, day: int) -> None:
        self.data["anchor"] = {"date": d.isoformat(), "day": int(day)}
        self.data["anchor_confirmed"] = True

    @property
    def extra_closures(self) -> list[date]:
        return [date.fromisoformat(s) for s in self.data.get("extra_closures", [])]

    @property
    def pause_until(self) -> date | None:
        p = self.data.get("pause_until")
        return date.fromisoformat(p) if p else None

    def active_rules(self) -> list[dict]:
        return [r for r in self.data["rules"] if r.get("enabled")]
