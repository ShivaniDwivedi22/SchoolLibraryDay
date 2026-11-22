"""Plain-text activity log: one line per reminder, action or sync."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path


class LogBook:
    def __init__(self, path: Path):
        self.path = path

    def write(self, what: str, outcome: str, child: str = "", when: datetime | None = None) -> None:
        when = when or datetime.now()
        line = f"{when:%Y-%m-%d %H:%M}  {child:<8}  {what:<40}  {outcome}\n"
        try:
            with self.path.open("a", encoding="utf-8") as f:
                f.write(line)
        except OSError:
            pass

    def tail(self, n: int = 200) -> list[str]:
        try:
            return self.path.read_text(encoding="utf-8").splitlines()[-n:]
        except OSError:
            return []
