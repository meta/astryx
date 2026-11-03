---
'@astryxdesign/core': patch
---

[feat] Core gains an internal parser for dates typed in a calendar system. It reads dates typed in any `CalendarSystem`, in any decimal digits, with month and era names, leap months such as Adar I, and Japanese eras such as `令和元年`, and returns a Gregorian date. A date the calendar does not have is rejected and never adjusted. It also writes the committed text and the format hint, and reads them back as the same date in each calendar's own locale, in English and Swedish, and in locales whose weekday names are also month or era names. No component uses it yet, and no public API changes.

@nynexman4464
