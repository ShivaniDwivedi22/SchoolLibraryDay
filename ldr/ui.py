"""Tkinter windows: reminder pop-up, upcoming list, settings, calibrate, log."""

from __future__ import annotations

import tkinter as tk
from datetime import date, timedelta
from tkinter import messagebox, ttk

from . import APP_NAME, gcal, paths
from .config import new_rule
from .schedule import parse_hhmm

PAD = {"padx": 8, "pady": 4}


def _fmt(d: date) -> str:
    return f"{d:%A, %b} {d.day}, {d.year}"


def reminder_popup(root: tk.Tk, heading: str, text: str, on_packed, on_snooze, on_skip,
                   show_buttons: bool = True) -> None:
    win = tk.Toplevel(root)
    win.title(heading)
    win.attributes("-topmost", True)
    win.resizable(False, False)
    ttk.Label(win, text=heading, font=("Segoe UI", 12, "bold")).pack(anchor="w", padx=16, pady=(14, 4))
    ttk.Label(win, text=text, wraplength=360, font=("Segoe UI", 10)).pack(anchor="w", padx=16, pady=(0, 12))
    bar = ttk.Frame(win)
    bar.pack(fill="x", padx=12, pady=(0, 12))

    def act(fn):
        def _():
            win.destroy()
            if fn:
                fn()
        return _

    if show_buttons:
        ttk.Button(bar, text="✅ Packed", command=act(on_packed)).pack(side="left", padx=4)
        ttk.Button(bar, text="Snooze 30 min", command=act(on_snooze)).pack(side="left", padx=4)
        ttk.Button(bar, text="Skip", command=act(on_skip)).pack(side="left", padx=4)
    ttk.Button(bar, text="Close", command=act(None)).pack(side="right", padx=4)
    win.protocol("WM_DELETE_WINDOW", act(None))
    win.update_idletasks()
    w, h = win.winfo_width(), win.winfo_height()
    x = win.winfo_screenwidth() - w - 24
    y = win.winfo_screenheight() - h - 80
    win.geometry(f"+{x}+{y}")
    win.lift()
    win.focus_force()


def upcoming_window(root: tk.Tk, app) -> None:
    win = tk.Toplevel(root)
    win.title(f"{APP_NAME} - Upcoming")
    win.attributes("-topmost", True)
    frm = ttk.Frame(win, padding=14)
    frm.pack(fill="both", expand=True)
    today = date.today()
    tasks = app.scheduler.upcoming(today, count=6) if app.scheduler else []
    if not tasks:
        ttk.Label(frm, text="No upcoming reminders.\nCheck Settings (rules, calendar, pause).").pack(anchor="w")
    else:
        nxt = tasks[0]
        r = nxt.rule
        ttk.Label(frm, text="Next:", font=("Segoe UI", 10)).pack(anchor="w")
        ttk.Label(frm, text=f"{r.get('child')}: {r.get('title')}", font=("Segoe UI", 13, "bold")).pack(anchor="w")
        ttk.Label(frm, text=f"{_fmt(nxt.day)}   ·   Cycle Day {nxt.cycle}",
                  font=("Segoe UI", 11)).pack(anchor="w", pady=(0, 6))
        if r.get("items"):
            tip = "Pack " + r["items"] + (" tonight" if nxt.day - today == timedelta(days=1) else "")
            ttk.Label(frm, text=f"Reminder: {tip}").pack(anchor="w", pady=(0, 10))
        ttk.Separator(frm).pack(fill="x", pady=6)
        ttk.Label(frm, text="Coming up", font=("Segoe UI", 10, "bold")).pack(anchor="w")
        last = today
        lines = []
        for t in tasks:
            for br in app.cal.breaks_between(last, t.day - timedelta(days=1)):
                span = f"{br.start:%b} {br.start.day}" + (
                    f" – {br.end:%b} {br.end.day}" if br.end != br.start else "")
                lines.append(f"   {span}:  {br.name} (no school)")
            status = app.state.task_status(t.key)
            mark = {"packed": "  ✅ packed", "skipped": "  (skipped)"}.get(status, "")
            lines.append(f"{t.day:%a %b} {t.day.day:<3} Day {t.cycle}   {t.rule.get('child')}: "
                         f"{t.rule.get('title')}{mark}")
            last = t.day + timedelta(days=1)
        ttk.Label(frm, text="\n".join(dict.fromkeys(lines)), font=("Consolas", 10),
                  justify="left").pack(anchor="w")
    today_c = app.scheduler.cycle_of(today) if app.scheduler else None
    ttk.Separator(frm).pack(fill="x", pady=6)
    ttk.Label(frm, text=f"Today: {'Cycle Day ' + str(today_c) if today_c else 'no school'}"
              f"   ·   Calendar: {app.cal_source}", foreground="#666").pack(anchor="w")
    ttk.Button(frm, text="Close", command=win.destroy).pack(anchor="e", pady=(10, 0))


def calibrate_dialog(root: tk.Tk, app, first_run: bool = False) -> None:
    win = tk.Toplevel(root)
    win.title(f"{APP_NAME} - Calibrate cycle day")
    win.attributes("-topmost", True)
    frm = ttk.Frame(win, padding=14)
    frm.pack(fill="both", expand=True)
    intro = ("Welcome! To count cycle days correctly, tell the app the cycle day on one school day."
             if first_run else
             "If the school's cycle day differs from what the app shows (for example after a "
             "snow day), set the correct day here. The app counts from this date.")
    ttk.Label(frm, text=intro, wraplength=380).grid(row=0, column=0, columnspan=2, sticky="w", pady=(0, 10))
    d0 = app.cal.next_school_day(date.today()) or date.today()
    suggested = app.scheduler.cycle_of(d0) if app.scheduler else 1
    ttk.Label(frm, text="School day (YYYY-MM-DD):").grid(row=1, column=0, sticky="w", **PAD)
    d_var = tk.StringVar(value=d0.isoformat())
    ttk.Entry(frm, textvariable=d_var, width=14).grid(row=1, column=1, sticky="w", **PAD)
    ttk.Label(frm, text="Cycle day on that date:").grid(row=2, column=0, sticky="w", **PAD)
    c_var = tk.IntVar(value=suggested or 1)
    ttk.Spinbox(frm, from_=1, to=app.cfg["cycle_length"], textvariable=c_var, width=5).grid(
        row=2, column=1, sticky="w", **PAD)

    snow = tk.BooleanVar(value=False)
    if not first_run:
        ttk.Checkbutton(frm, text="Also mark a past date as an unplanned closure (snow day):",
                        variable=snow).grid(row=3, column=0, columnspan=2, sticky="w", **PAD)
        s_var = tk.StringVar(value=date.today().isoformat())
        ttk.Entry(frm, textvariable=s_var, width=14).grid(row=4, column=1, sticky="w", **PAD)

    def save():
        try:
            d = date.fromisoformat(d_var.get().strip())
            c = int(c_var.get())
            assert 1 <= c <= app.cfg["cycle_length"]
        except Exception:
            messagebox.showerror(APP_NAME, "Please enter a date as YYYY-MM-DD and a valid cycle day.", parent=win)
            return
        if not app.cal.is_school_day(d):
            messagebox.showerror(APP_NAME, f"{_fmt(d)} is not a school day "
                                 f"({app.cal.day_off_reason(d)}).", parent=win)
            return
        if not first_run and snow.get():
            try:
                closure = date.fromisoformat(s_var.get().strip())
                app.cfg["extra_closures"] = sorted(set(app.cfg["extra_closures"]) | {closure.isoformat()})
            except ValueError:
                messagebox.showerror(APP_NAME, "Closure date must be YYYY-MM-DD.", parent=win)
                return
        app.cfg.set_anchor(d, c)
        app.cfg.save()
        app.log.write(f"Calibrated: {d.isoformat()} = Day {c}", "saved")
        win.destroy()
        app.reload()

    ttk.Button(frm, text="Save", command=save).grid(row=5, column=1, sticky="e", pady=(10, 0))


def pause_dialog(root: tk.Tk, app) -> None:
    win = tk.Toplevel(root)
    win.title(f"{APP_NAME} - Pause reminders")
    win.attributes("-topmost", True)
    frm = ttk.Frame(win, padding=14)
    frm.pack()
    cur = app.cfg.pause_until
    ttk.Label(frm, text="Pause reminders up to and including (YYYY-MM-DD).\nLeave empty to resume.").pack(anchor="w")
    v = tk.StringVar(value=cur.isoformat() if cur else "")
    ttk.Entry(frm, textvariable=v, width=14).pack(anchor="w", pady=6)

    def save():
        s = v.get().strip()
        try:
            app.cfg["pause_until"] = date.fromisoformat(s).isoformat() if s else None
        except ValueError:
            messagebox.showerror(APP_NAME, "Date must be YYYY-MM-DD.", parent=win)
            return
        app.cfg.save()
        app.log.write("Pause until " + (s or "(resumed)"), "saved")
        win.destroy()
        app.reload()

    ttk.Button(frm, text="Save", command=save).pack(anchor="e")


def log_window(root: tk.Tk, app) -> None:
    win = tk.Toplevel(root)
    win.title(f"{APP_NAME} - Log")
    txt = tk.Text(win, width=100, height=28, font=("Consolas", 9))
    txt.pack(fill="both", expand=True)
    txt.insert("end", "\n".join(reversed(app.log.tail(400))) or "(empty)")
    txt.configure(state="disabled")
    ttk.Label(win, text=f"Data folder: {paths.data_dir()}", foreground="#666").pack(anchor="w", padx=6, pady=4)


def settings_window(root: tk.Tk, app) -> None:
    cfg = app.cfg
    win = tk.Toplevel(root)
    win.title(f"{APP_NAME} - Settings")
    nb = ttk.Notebook(win)
    nb.pack(fill="both", expand=True, padx=8, pady=8)

    # --- Reminders tab ----------------------------------------------------
    tab = ttk.Frame(nb, padding=10)
    nb.add(tab, text="Reminders")
    cols = ("child", "cycle_day", "title", "items", "night_before", "morning_of", "enabled")
    heads = ("Child", "Day", "What", "Pack", "Night before", "Morning of", "On")
    tree = ttk.Treeview(tab, columns=cols, show="headings", height=7)
    for c, h, w in zip(cols, heads, (80, 40, 200, 170, 90, 90, 40)):
        tree.heading(c, text=h)
        tree.column(c, width=w, anchor="w")
    tree.grid(row=0, column=0, columnspan=4, sticky="nsew")
    rules = [dict(r) for r in cfg["rules"]]

    def refresh():
        tree.delete(*tree.get_children())
        for i, r in enumerate(rules):
            tree.insert("", "end", iid=str(i), values=(
                r["child"], r["cycle_day"], r["title"], r["items"],
                r["night_before"] or "off", r["morning_of"] or "off", "yes" if r["enabled"] else "no"))

    def edit(idx=None):
        rule = dict(rules[idx]) if idx is not None else new_rule()
        dlg = tk.Toplevel(win)
        dlg.title("Reminder")
        dlg.transient(win)
        f = ttk.Frame(dlg, padding=12)
        f.pack()
        fields = [("child", "Child's name"), ("cycle_day", f"Cycle day (1-{cfg['cycle_length']})"),
                  ("title", "What is it (e.g. library book return day)"),
                  ("items", "What to pack (e.g. the library book and bag)"),
                  ("night_before", "Night-before time HH:MM (empty = off)"),
                  ("morning_of", "Morning-of time HH:MM (empty = off)")]
        vars_ = {}
        for row, (k, label) in enumerate(fields):
            ttk.Label(f, text=label).grid(row=row, column=0, sticky="w", **PAD)
            vars_[k] = tk.StringVar(value=str(rule.get(k, "")))
            ttk.Entry(f, textvariable=vars_[k], width=36).grid(row=row, column=1, **PAD)
        en = tk.BooleanVar(value=rule.get("enabled", True))
        ttk.Checkbutton(f, text="Enabled", variable=en).grid(row=len(fields), column=1, sticky="w", **PAD)

        def ok():
            try:
                day = int(vars_["cycle_day"].get())
                assert 1 <= day <= cfg["cycle_length"]
                for k in ("night_before", "morning_of"):
                    parse_hhmm(vars_[k].get())
            except Exception:
                messagebox.showerror(APP_NAME, "Check the cycle day and the times (HH:MM, 24-hour).", parent=dlg)
                return
            for k in ("child", "title", "items", "night_before", "morning_of"):
                rule[k] = vars_[k].get().strip()
            rule["cycle_day"] = day
            rule["enabled"] = en.get()
            if idx is None:
                rules.append(rule)
            else:
                rules[idx] = rule
            refresh()
            dlg.destroy()

        ttk.Button(f, text="OK", command=ok).grid(row=len(fields) + 1, column=1, sticky="e", pady=8)

    def selected():
        sel = tree.selection()
        return int(sel[0]) if sel else None

    def remove():
        i = selected()
        if i is not None and messagebox.askyesno(APP_NAME, "Remove this reminder?", parent=win):
            rules.pop(i)
            refresh()

    ttk.Button(tab, text="Add", command=lambda: edit()).grid(row=1, column=0, sticky="w", pady=6)
    ttk.Button(tab, text="Edit", command=lambda: selected() is not None and edit(selected())).grid(
        row=1, column=1, sticky="w", pady=6)
    ttk.Button(tab, text="Remove", command=remove).grid(row=1, column=2, sticky="w", pady=6)
    tree.bind("<Double-1>", lambda e: selected() is not None and edit(selected()))
    refresh()

    # --- School tab -------------------------------------------------------
    st = ttk.Frame(nb, padding=10)
    nb.add(st, text="School")
    school = tk.StringVar(value=cfg["school"])
    url = tk.StringVar(value=cfg["calendar_url"])
    length = tk.IntVar(value=cfg["cycle_length"])
    closures = tk.StringVar(value=", ".join(cfg["extra_closures"]))
    rows = [("School", ttk.Entry(st, textvariable=school, width=50)),
            ("Calendar feed (ICS URL)", ttk.Entry(st, textvariable=url, width=50)),
            ("Days in cycle", ttk.Spinbox(st, from_=2, to=10, textvariable=length, width=5)),
            ("Extra closures (snow days), comma-separated YYYY-MM-DD",
             ttk.Entry(st, textvariable=closures, width=50))]
    for i, (label, w) in enumerate(rows):
        ttk.Label(st, text=label).grid(row=i, column=0, sticky="w", **PAD)
        w.grid(row=i, column=1, sticky="w", **PAD)
    a = cfg.anchor
    ttk.Label(st, text=f"Cycle anchor: {a[0].isoformat()} = Day {a[1]}" if a else "Cycle anchor: not set",
              foreground="#666").grid(row=len(rows), column=0, columnspan=2, sticky="w", **PAD)
    ttk.Label(st, text=f"Calendar in use: {app.cal_source}; school year "
              f"{app.cal.first_day} to {app.cal.last_day}", foreground="#666").grid(
        row=len(rows) + 1, column=0, columnspan=2, sticky="w", **PAD)
    ttk.Button(st, text="Calibrate cycle day…", command=lambda: calibrate_dialog(root, app)).grid(
        row=len(rows) + 2, column=0, sticky="w", **PAD)
    ttk.Button(st, text="Update calendar now", command=app.refresh_calendar_async).grid(
        row=len(rows) + 2, column=1, sticky="w", **PAD)

    # --- Notifications tab ------------------------------------------------
    nt = ttk.Frame(nb, padding=10)
    nb.add(nt, text="Notifications")
    win_n = tk.BooleanVar(value=cfg["notify_windows"])
    g_on = tk.BooleanVar(value=cfg["google"]["enabled"])
    g_name = tk.StringVar(value=cfg["google"]["calendar_name"])
    g_time = tk.StringVar(value=cfg["google"]["event_time"])
    auto = tk.BooleanVar(value=cfg["autostart"])
    ttk.Checkbutton(nt, text="Windows pop-up reminders on this PC", variable=win_n).grid(
        row=0, column=0, columnspan=2, sticky="w", **PAD)
    ttk.Checkbutton(nt, text="Google Calendar (reminders on your phone)", variable=g_on).grid(
        row=1, column=0, columnspan=2, sticky="w", **PAD)
    ttk.Label(nt, text="Calendar name").grid(row=2, column=0, sticky="w", **PAD)
    ttk.Entry(nt, textvariable=g_name, width=30).grid(row=2, column=1, sticky="w", **PAD)
    ttk.Label(nt, text="Event time on the day (HH:MM)").grid(row=3, column=0, sticky="w", **PAD)
    ttk.Entry(nt, textvariable=g_time, width=8).grid(row=3, column=1, sticky="w", **PAD)
    g_status = tk.StringVar()

    def upd_status():
        if not gcal.is_configured():
            g_status.set(f"Not set up: put client_secret.json in {paths.data_dir()} (see README).")
        elif gcal.is_signed_in():
            g_status.set("Signed in to Google.")
        else:
            g_status.set("Ready to sign in.")

    upd_status()
    ttk.Label(nt, textvariable=g_status, foreground="#666", wraplength=460).grid(
        row=4, column=0, columnspan=2, sticky="w", **PAD)
    gb = ttk.Frame(nt)
    gb.grid(row=5, column=0, columnspan=2, sticky="w")
    ttk.Button(gb, text="Sign in and sync now", command=lambda: app.google_sync_async(interactive=True)).pack(
        side="left", **PAD)
    ttk.Button(gb, text="Sign out", command=lambda: (gcal.sign_out(), upd_status())).pack(side="left", **PAD)
    ttk.Checkbutton(nt, text="Start automatically with Windows", variable=auto).grid(
        row=6, column=0, columnspan=2, sticky="w", pady=(16, 4), padx=8)

    # --- Save -------------------------------------------------------------
    def save():
        try:
            parse_hhmm(g_time.get())
            extra = [date.fromisoformat(s.strip()).isoformat() for s in closures.get().split(",") if s.strip()]
        except ValueError:
            messagebox.showerror(APP_NAME, "Check the event time (HH:MM) and closure dates (YYYY-MM-DD).", parent=win)
            return
        cfg["rules"] = rules
        cfg["school"] = school.get().strip()
        new_url = url.get().strip()
        url_changed = new_url != cfg["calendar_url"]
        cfg["calendar_url"] = new_url
        cfg["cycle_length"] = int(length.get())
        cfg["extra_closures"] = sorted(set(extra))
        cfg["notify_windows"] = win_n.get()
        cfg["google"] = {"enabled": g_on.get(), "calendar_name": g_name.get().strip() or "School reminders",
                         "event_time": g_time.get().strip() or "08:00"}
        cfg["autostart"] = auto.get()
        cfg.save()
        app.log.write("Settings", "saved")
        win.destroy()
        app.apply_autostart()
        if url_changed:
            app.refresh_calendar_async()
        app.reload()

    bar = ttk.Frame(win)
    bar.pack(fill="x", padx=8, pady=(0, 8))
    ttk.Button(bar, text="View log", command=lambda: log_window(root, app)).pack(side="left")
    ttk.Button(bar, text="Save", command=save).pack(side="right")
    ttk.Button(bar, text="Cancel", command=win.destroy).pack(side="right", padx=6)
