# Library Day Reminder

A small Windows tray app that works out DDSB elementary cycle days and reminds you
the night before and the morning of your child's library book return day. It can
also add those days to Google Calendar so the reminders reach your phone.

## Download

Go to **Releases** on this repository and download `LibraryDayReminder.exe`.
No installation is needed: put it anywhere (for example in Documents) and double-click it.

Windows may show "Windows protected your PC" the first time, because the app is
not code-signed. Click **More info**, then **Run anyway**.

## First run

1. A **Calibrate cycle day** window opens. Enter a school day and its cycle day
   (pre-filled with Tuesday Nov 24, 2026 = Day 3) and click Save.
2. A book icon appears in the system tray (bottom-right, maybe under the ^ arrow).
3. Right-click it for: Upcoming library days, Remind me now, Mark next as packed,
   Calibrate, Pause, Settings, View log, Exit.

Out of the box it reminds you at **7:00 PM the night before** and **7:00 AM the
morning of** Arin's Day 3 (book and bag return). Change children, days, times and
what to pack in **Settings > Reminders**. Add a rule per child to support several children.

The app starts automatically with Windows (turn this off in Settings > Notifications).

## How cycle days are worked out

Neither the DDSB site nor heyschool.ca publishes cycle days per date, so the app
counts them itself:

- School days come from the [heyschool.ca DDSB elementary calendar feed](https://heyschool.ca/calendars/ics/durham-district-school-board-elementary.ics)
  (PA days, holidays, Christmas Break, March Break). It is downloaded weekly; a
  built-in copy of 2026-27 is used if the download fails.
- The cycle (5 days) moves forward one day per school day, starting from the day you calibrated.
- **Snow days / unplanned closures:** the app assumes the cycle resumes where it
  stopped. Add the closure date in Settings > School (or in the Calibrate window).
  If the school skips ahead instead, just use **Calibrate cycle day**.

## Reminders

- Pop-up with **Packed**, **Snooze 30 min** and **Skip** buttons. Packed the night
  before cancels the morning reminder.
- If the PC was off at reminder time, the reminder is shown as **Missed reminder**
  when it starts (night reminders until 9:00 AM on the day, morning ones until noon).
- The tray icon gets a red dot when a return day is today or tomorrow, and an
  amber dot when something needs attention (calendar out of date, sync failed).

## Google Calendar (optional, phone reminders)

Google requires every app that writes to a calendar to have its own sign-in key.
It is free and takes about 10 minutes, once:

1. Go to <https://console.cloud.google.com/>, sign in, and create a project
   (for example "Library Reminder").
2. **APIs & Services > Library**: search "Google Calendar API" and click **Enable**.
3. **APIs & Services > OAuth consent screen**: choose **External**, fill in the app
   name and your email, and on **Test users** add your own Gmail address.
4. **APIs & Services > Credentials > Create credentials > OAuth client ID**:
   application type **Desktop app**. Click **Download JSON**.
5. Rename the file to `client_secret.json` and put it in
   `%APPDATA%\LibraryReminder\` (paste that into the File Explorer address bar).
6. In the app: **Settings > Notifications**, tick **Google Calendar**, Save, then
   **Sign in and sync now**. A browser opens; sign in and allow access
   (Google warns that the app is unverified: click **Continue**, since it's your own app).

The app creates a calendar called **School reminders** with one event per return
day (8:00 AM, 15 minutes) carrying pop-up reminders at your night-before and
morning-of times. It only changes events it created, re-syncs whenever settings or
the calendar change, and leaves past events as history.

Note: while the Google project is in "Testing" mode, Google expires the sign-in
after 7 days, and the tray shows an amber dot. To avoid that, on the OAuth consent
screen click **Publish app** (no review is needed for personal use with your own account).

## Files

Everything lives in `%APPDATA%\LibraryReminder\`:

| File | What |
| --- | --- |
| `settings.json` | Your settings |
| `state.json` | Which reminders were sent / packed / skipped |
| `log.txt` | Activity log (also under right-click > View log) |
| `school-calendar.ics` | Cached school calendar |
| `client_secret.json`, `google_token.json` | Google sign-in (optional) |

## Building

GitHub Actions builds the exe on every push (see `.github/workflows/build.yml`);
pushing a tag like `v1.0.1` publishes a release. To build locally on Windows:

```
pip install -r requirements.txt pyinstaller
pyinstaller --onefile --windowed --name LibraryDayReminder --hidden-import pystray._win32 --collect-data googleapiclient main.py
```

Run the tests with `python -m pytest`.
