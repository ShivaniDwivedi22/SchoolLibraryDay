"""Main app: tray icon + reminder loop on the Tk main thread."""

from __future__ import annotations

import os
import queue
import socket
import sys
import threading
import tkinter as tk
from datetime import date, datetime, timedelta
from tkinter import messagebox

import pystray
from PIL import Image, ImageDraw

from . import APP_NAME, __version__, gcal, paths, ui
from .config import Config
from .logbook import LogBook
from .schedule import Reminder, Scheduler, State
from .schoolcal import SchoolCalendar, download, load_events

TICK_MS = 20_000
CAL_REFRESH = timedelta(days=7)
SINGLE_INSTANCE_PORT = 47613


def make_icon(alert: bool = False, warn: bool = False) -> Image.Image:
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((8, 6, 56, 58), radius=6, fill=(37, 99, 235))      # book cover
    d.rectangle((14, 6, 18, 58), fill=(29, 78, 216))                       # spine
    for y in (20, 28, 36):
        d.line((24, y, 48, y), fill=(255, 255, 255), width=3)               # text lines
    if alert or warn:
        color = (220, 38, 38) if alert else (245, 158, 11)
        d.ellipse((38, 36, 62, 60), fill=color, outline=(255, 255, 255), width=3)
    return img


class App:
    def __init__(self):
        self.cfg = Config(paths.config_file())
        self.state = State(paths.state_file())
        self.log = LogBook(paths.log_file())
        self.root = tk.Tk()
        self.root.withdraw()
        self.root.title(APP_NAME)
        self.calls: queue.Queue = queue.Queue()
        self.warning: str | None = None
        self.cal: SchoolCalendar
        self.cal_source = ""
        self.scheduler: Scheduler | None = None
        self.icon = pystray.Icon("library_day_reminder", make_icon(), APP_NAME, menu=self._menu())
        self.reload()

    # -- model -------------------------------------------------------------
    def reload(self) -> None:
        events, self.cal_source = load_events(paths.calendar_cache())
        self.cal = SchoolCalendar(events, self.cfg.extra_closures)
        anchor = self.cfg.anchor
        self.scheduler = (Scheduler(self.cal, anchor, self.cfg["cycle_length"], self.cfg.active_rules(),
                                    self.state, self.cfg.pause_until) if anchor else None)
        today = date.today()
        if self.cal.last_day is None or self.cal.last_day < today:
            # Summer, or the new school year's dates are not in the feed yet.
            self.warning = "The new school year's calendar is not loaded yet. Update it in Settings > School."
        elif not anchor:
            self.warning = "Set the cycle day: right-click > Calibrate cycle day."
        else:
            self.warning = None
        self.update_icon()
        if self.cfg["google"]["enabled"] and gcal.is_signed_in():
            self.google_sync_async(interactive=False)

    def update_icon(self) -> None:
        today = date.today()
        alert = False
        tip = APP_NAME
        if self.scheduler:
            nxt = self.scheduler.upcoming(today, count=1)
            if nxt:
                t = nxt[0]
                tip = f"Next: {t.rule.get('child')} {t.rule.get('title')}, {t.day:%a %b} {t.day.day} (Day {t.cycle})"
                soon = (t.day - today).days <= 1 and self.state.task_status(t.key) not in ("packed", "skipped")
                alert = soon
        if self.warning:
            tip = self.warning
        self.icon.icon = make_icon(alert=alert, warn=bool(self.warning))
        self.icon.title = tip[:127]

    # -- tray menu (runs on the pystray thread; hand work to Tk) -----------
    def _on_tk(self, fn):
        return lambda icon=None, item=None: self.calls.put(fn)

    def _menu(self):
        M = pystray.MenuItem
        return pystray.Menu(
            M("Upcoming library days", self._on_tk(lambda: ui.upcoming_window(self.root, self)), default=True),
            M("Remind me now", self._on_tk(self.remind_now)),
            M("Mark next as packed", self._on_tk(self.mark_next_packed)),
            pystray.Menu.SEPARATOR,
            M("Calibrate cycle day…", self._on_tk(lambda: ui.calibrate_dialog(self.root, self))),
            M("Pause reminders…", self._on_tk(lambda: ui.pause_dialog(self.root, self))),
            M("Settings…", self._on_tk(lambda: ui.settings_window(self.root, self))),
            M("View log", self._on_tk(lambda: ui.log_window(self.root, self))),
            pystray.Menu.SEPARATOR,
            M("Exit", self._on_tk(self.quit)),
        )

    def _pump(self):
        try:
            while True:
                self.calls.get_nowait()()
        except queue.Empty:
            pass
        self.root.after(200, self._pump)

    # -- reminders ---------------------------------------------------------
    def tick(self):
        try:
            self.check_due(datetime.now())
            self.maybe_refresh_calendar()
        except Exception as exc:  # never let the loop die
            self.log.write("Reminder check", f"error: {exc}")
        self.root.after(TICK_MS, self.tick)

    def check_due(self, now: datetime):
        if not self.scheduler:
            return
        if date.today() != getattr(self, "_last_day", None):
            self._last_day = date.today()
            self.update_icon()
        for rem, late in self.scheduler.due(now):
            self.state.set_reminder(rem.key, sent=now.isoformat(), snooze_until=None)
            self.state.save()
            kind = "night-before" if rem.kind == "night" else "morning"
            self.log.write(f"Day {rem.task.cycle} {kind} reminder", "sent (late)" if late else "sent",
                           rem.task.rule.get("child", ""))
            if self.cfg["notify_windows"]:
                self.show(rem, late)
        self.update_icon()

    def show(self, rem: Reminder, late: bool = False):
        heading, text = rem.message(late)
        try:
            self.icon.notify(text, heading)
        except Exception:
            pass
        child = rem.task.rule.get("child", "")

        def packed():
            self.state.set_task(rem.task.key, "packed")
            self.state.save()
            self.log.write(f"Day {rem.task.cycle} {rem.task.day:%b %d}", "marked packed", child)
            self.update_icon()

        def snooze():
            until = datetime.now() + timedelta(minutes=30)
            self.state.set_reminder(rem.key, snooze_until=until.isoformat())
            self.state.save()
            self.log.write(f"Day {rem.task.cycle} reminder", f"snoozed until {until:%H:%M}", child)

        def skip():
            self.state.set_task(rem.task.key, "skipped")
            self.state.save()
            self.log.write(f"Day {rem.task.cycle} {rem.task.day:%b %d}", "skipped", child)
            self.update_icon()

        ui.reminder_popup(self.root, heading, text, packed, snooze, skip)

    def remind_now(self):
        if not self.scheduler:
            ui.calibrate_dialog(self.root, self, first_run=True)
            return
        nxt = self.scheduler.upcoming(date.today(), count=1)
        if not nxt:
            messagebox.showinfo(APP_NAME, "No upcoming reminders found.")
            return
        t = nxt[0]
        kind = "morning" if t.day == date.today() else "night"
        when = datetime.now()
        rem = Reminder(t, kind, when if kind == "morning" else datetime.combine(t.day - timedelta(days=1), when.time()))
        self.log.write(f"Day {t.cycle} reminder (manual)", "shown", t.rule.get("child", ""))
        heading, text = rem.message()
        if kind == "night" and t.day - date.today() > timedelta(days=1):
            text = f"Next: {t.day:%A, %b} {t.day.day} is {t.rule.get('child')}'s {t.rule.get('title')} (Day {t.cycle})."
        ui.reminder_popup(self.root, heading, text, lambda: self._mark(t, "packed"),
                          lambda: None, lambda: self._mark(t, "skipped"))

    def _mark(self, task, status):
        self.state.set_task(task.key, status)
        self.state.save()
        self.log.write(f"Day {task.cycle} {task.day:%b %d}", f"marked {status}", task.rule.get("child", ""))
        self.update_icon()

    def mark_next_packed(self):
        if self.scheduler:
            nxt = self.scheduler.upcoming(date.today(), count=1)
            if nxt:
                self._mark(nxt[0], "packed")

    # -- background work ---------------------------------------------------
    def maybe_refresh_calendar(self):
        cache = paths.calendar_cache()
        age_ok = cache.exists() and datetime.now() - datetime.fromtimestamp(cache.stat().st_mtime) < CAL_REFRESH
        if not age_ok and not getattr(self, "_cal_refreshing", False):
            self.refresh_calendar_async(quiet=True)

    def refresh_calendar_async(self, quiet: bool = False):
        self._cal_refreshing = True

        def work():
            try:
                download(self.cfg["calendar_url"], paths.calendar_cache())
                self.log.write("School calendar download", "ok")
                self.calls.put(self.reload)
                if not quiet:
                    self.calls.put(lambda: messagebox.showinfo(APP_NAME, "School calendar updated."))
            except Exception as exc:
                self.log.write("School calendar download", f"failed: {exc}")
                if not quiet:
                    self.calls.put(lambda exc=exc: messagebox.showwarning(
                        APP_NAME, f"Could not update the school calendar:\n{exc}\n\nThe saved copy is still used."))
            finally:
                self._cal_refreshing = False

        threading.Thread(target=work, daemon=True).start()

    def google_sync_async(self, interactive: bool = False):
        if getattr(self, "_syncing", False) or not self.scheduler:
            return
        self._syncing = True
        sched = self.scheduler
        gcfg = dict(self.cfg["google"])

        def work():
            try:
                res = gcal.sync(sched, gcfg, interactive=interactive)
                self.log.write("Google Calendar sync",
                               f"ok ({res['added']} added, {res['updated']} updated, {res['removed']} removed)")
                if interactive:
                    self.calls.put(lambda: messagebox.showinfo(
                        APP_NAME, f"Google Calendar synced: {res['added']} added, "
                                  f"{res['updated']} updated, {res['removed']} removed."))
                if self.warning and "Google" in self.warning:
                    self.warning = None
                    self.calls.put(self.update_icon)
            except Exception as exc:
                self.log.write("Google Calendar sync", f"failed: {exc}")
                self.warning = f"Google Calendar sync failed: {exc}"
                self.calls.put(self.update_icon)
                if interactive:
                    self.calls.put(lambda exc=exc: messagebox.showwarning(APP_NAME, f"Google Calendar sync failed:\n{exc}"))
            finally:
                self._syncing = False

        threading.Thread(target=work, daemon=True).start()

    # -- Windows startup ---------------------------------------------------
    def apply_autostart(self):
        if os.name != "nt" or not getattr(sys, "frozen", False):
            return
        import winreg
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run",
                             0, winreg.KEY_SET_VALUE)
        try:
            if self.cfg["autostart"]:
                winreg.SetValueEx(key, "LibraryDayReminder", 0, winreg.REG_SZ, f'"{sys.executable}"')
            else:
                try:
                    winreg.DeleteValue(key, "LibraryDayReminder")
                except FileNotFoundError:
                    pass
        finally:
            winreg.CloseKey(key)

    # -- lifecycle ---------------------------------------------------------
    def quit(self):
        self.log.write("App", "exit")
        self.icon.stop()
        self.root.quit()

    def run(self):
        self.log.write(f"App started (v{__version__})", "ok")
        try:
            self.apply_autostart()
        except OSError as exc:
            self.log.write("Start with Windows", f"failed: {exc}")
        self.icon.run_detached()
        self.root.after(200, self._pump)
        self.root.after(1500, self.tick)
        if not self.cfg["anchor_confirmed"]:
            self.root.after(800, lambda: ui.calibrate_dialog(self.root, self, first_run=True))
        self.root.mainloop()
        self.state.save()
        os._exit(0)  # don't wait on the tray thread


def main():
    lock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        lock.bind(("127.0.0.1", SINGLE_INSTANCE_PORT))
    except OSError:
        r = tk.Tk()
        r.withdraw()
        messagebox.showinfo(APP_NAME, f"{APP_NAME} is already running. Look for the book icon in the tray.")
        return
    App().run()
