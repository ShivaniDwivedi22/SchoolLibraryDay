# School Day (phone app)

Reminds you the night before and the morning of your child's library book
return day (or any cycle-day item), for DDSB elementary's 5-day cycle.
Works on Android and iPhone; everything runs on the phone, with no account and no server.

## Install on Android

1. On GitHub, open **Actions > Build Android app**, click the latest green run and
   download **SchoolDay-android** under Artifacts. Unzip it to get `SchoolDay.apk`.
   (Easiest: open the run on the phone itself, or send the APK to the phone.)
2. Open `SchoolDay.apk` on the phone. Android asks to allow installing from this
   source (Chrome / Files): allow it, then tap **Install**.
3. Open **School Day** and allow notifications (and calendar, if you turn on calendar sync).

To update later, install the new APK the same way; your settings are kept.

## iPhone

iPhones only install apps from the App Store or TestFlight, which needs an Apple
Developer account (US$99/year). Once you have one, the same code is built with
Expo's cloud build (`npx eas-cli build --platform ios`) and installed via TestFlight.

## What it does

- **Home:** today's cycle day, the next return day with **Packed / Skip**, the
  coming weeks with breaks shown, and one-tap correction ("School says today is Day 2").
- **Reminders:** any number of reminders per child and cycle day, each with its own
  night-before and morning-of times, what to pack, and an optional last-call nudge.
- **Notifications** have **Packed** and **Snooze 30 min** buttons. Packed stops
  the remaining alerts for that day.
- **Google Calendar and email:** choose your Gmail calendar in Settings. Every
  return day is added with alerts at your times plus a Google email reminder,
  so it shows on every device signed in to that Google account.
- **Smart features:** weekly preview, back-to-school heads-up after breaks,
  last-call nudge, and suggestions to move a reminder to when you actually pack.
- **Adapts:** the school calendar (PA days, holidays, breaks) downloads weekly
  from the heyschool.ca DDSB feed, with a built-in 2026-27 copy as a fallback.
  Snow days can be added; the cycle resumes after them.

## Development

```
cd mobile
npm install
npm test            # core logic tests
npx tsc --noEmit    # typecheck
```
