"""Google Calendar sync.

Writes one event per task (e.g. "Arin: library book return day") into a
dedicated calendar, with phone pop-up reminders at the rule's night-before and
morning-of times. Only events this app created are touched (they carry a
private extended property), and past events are left alone as history.

Setup: put an OAuth "Desktop app" client file named client_secret.json in the
app's data folder (see README). The first sync opens a browser to sign in.
"""

from __future__ import annotations

import hashlib
from datetime import date, datetime, timedelta

from . import paths
from .schedule import Scheduler, Task, parse_hhmm

SCOPES = ["https://www.googleapis.com/auth/calendar"]
APP_TAG = "library-day-reminder"
TIMEZONE = "America/Toronto"


class GoogleSetupNeeded(Exception):
    pass


def is_configured() -> bool:
    return paths.google_client_secret().exists()


def is_signed_in() -> bool:
    return paths.google_token().exists()


def sign_out() -> None:
    try:
        paths.google_token().unlink()
    except FileNotFoundError:
        pass


def _service(interactive: bool):
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build

    creds = None
    token = paths.google_token()
    if token.exists():
        creds = Credentials.from_authorized_user_file(str(token), SCOPES)
    if creds and creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
        except Exception:
            creds = None
    if not creds or not creds.valid:
        if not interactive:
            raise GoogleSetupNeeded("Google sign-in expired. Use Settings > Sign in to Google.")
        if not is_configured():
            raise GoogleSetupNeeded(
                f"Google is not set up yet: put client_secret.json in {paths.data_dir()}"
            )
        flow = InstalledAppFlow.from_client_secrets_file(str(paths.google_client_secret()), SCOPES)
        creds = flow.run_local_server(port=0, open_browser=True)
    token.write_text(creds.to_json(), encoding="utf-8")
    return build("calendar", "v3", credentials=creds, cache_discovery=False)


def _calendar_id(svc, name: str) -> str:
    page = None
    while True:
        resp = svc.calendarList().list(pageToken=page).execute()
        for item in resp.get("items", []):
            if item.get("summary") == name:
                return item["id"]
        page = resp.get("nextPageToken")
        if not page:
            break
    created = svc.calendars().insert(body={"summary": name, "timeZone": TIMEZONE}).execute()
    return created["id"]


def _event_body(task: Task, event_time: str) -> dict:
    r = task.rule
    start_t = parse_hhmm(event_time) or parse_hhmm("08:00")
    start = datetime.combine(task.day, start_t)
    end = start + timedelta(minutes=15)
    overrides = []
    for field, day_offset in (("night_before", -1), ("morning_of", 0)):
        t = parse_hhmm(r.get(field, ""))
        if t:
            fire = datetime.combine(task.day + timedelta(days=day_offset), t)
            minutes = int((start - fire).total_seconds() // 60)
            if 0 <= minutes <= 40320:
                overrides.append({"method": "popup", "minutes": minutes})
    child = r.get("child") or "School"
    items = r.get("items")
    body = {
        "summary": f"{child}: {r.get('title', 'library day')}",
        "description": (f"Cycle Day {task.cycle}." + (f" Pack {items}." if items else "")
                        + "\nAdded by Library Day Reminder."),
        "start": {"dateTime": start.isoformat(), "timeZone": TIMEZONE},
        "end": {"dateTime": end.isoformat(), "timeZone": TIMEZONE},
        "reminders": {"useDefault": False, "overrides": overrides[:5]},
        "transparency": "transparent",
    }
    digest = hashlib.sha1(repr(sorted(body.items())).encode()).hexdigest()[:12]
    body["extendedProperties"] = {"private": {"app": APP_TAG, "key": task.key, "h": digest}}
    return body


def sync(scheduler: Scheduler, google_cfg: dict, interactive: bool = False,
         today: date | None = None) -> dict:
    """Make the calendar match the schedule from today to the end of the school year."""
    today = today or date.today()
    end = scheduler.cal.last_day
    if end is None or end < today:
        return {"added": 0, "updated": 0, "removed": 0}
    svc = _service(interactive)
    cal_id = _calendar_id(svc, google_cfg.get("calendar_name") or "School reminders")

    wanted = {}
    for task in scheduler.tasks_between(today, end):
        if scheduler.pause_until and task.day <= scheduler.pause_until:
            continue
        wanted[task.key] = _event_body(task, google_cfg.get("event_time", "08:00"))

    existing = {}
    page = None
    time_min = datetime.combine(today, datetime.min.time()).isoformat() + "Z"
    while True:
        resp = svc.events().list(
            calendarId=cal_id, privateExtendedProperty=f"app={APP_TAG}",
            timeMin=time_min, singleEvents=True, maxResults=250, pageToken=page,
        ).execute()
        for ev in resp.get("items", []):
            key = ev.get("extendedProperties", {}).get("private", {}).get("key")
            if key:
                existing[key] = ev
        page = resp.get("nextPageToken")
        if not page:
            break

    added = updated = removed = 0
    for key, body in wanted.items():
        ev = existing.pop(key, None)
        if ev is None:
            svc.events().insert(calendarId=cal_id, body=body).execute()
            added += 1
        elif ev["extendedProperties"]["private"].get("h") != body["extendedProperties"]["private"]["h"]:
            svc.events().update(calendarId=cal_id, eventId=ev["id"], body=body).execute()
            updated += 1
    for ev in existing.values():  # rule removed, day moved by calibration, etc.
        svc.events().delete(calendarId=cal_id, eventId=ev["id"]).execute()
        removed += 1
    return {"added": added, "updated": updated, "removed": removed}
