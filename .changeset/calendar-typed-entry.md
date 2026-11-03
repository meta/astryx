---
'@astryxdesign/core': patch
---

[feat] DateInput, DateTimeInput: type dates in other calendar systems. Both take a `calendar` prop, such as `'persian'`, `'hebrew'`, `'japanese'`, or `'buddhist'`, and otherwise use the `InternationalizationProvider` calendar; an explicit `-u-ca-` keyword in the provider locale asks for its calendar too, and `calendar="gregory"` keeps Gregorian. `value`, `onChange`, `min`, and `max` stay Gregorian ISO dates. People type a date the way the locale writes it in that calendar, in any decimal digits, such as `۱۴۰۵/۸/۱۱`, `1 Adar 5784`, or `令和元年5月1日`; the committed text, the popover calendar, and the `date`, `date_long`, and `date_weekday` formats use the calendar, and `system_date` stays the ISO date. Years are years of the calendar, so a Buddhist field reads `2026` as Buddhist year 2026: set `min` and `max` on Buddhist and ROC fields to catch a Gregorian year typed by mistake. A date the calendar does not have, such as 30 Esfand in a common Persian year, is named and never adjusted. An empty focused field without a `placeholder` shows an example date that the field accepts, and its description names the calendar when it differs from the `InternationalizationProvider` calendar. Calendars other than `gregory`, `iso8601`, `buddhist`, `roc`, and `japanese` need `Temporal`, native or a polyfill you load; without it the field shows Gregorian dates. The bottom-sheet and native surfaces still show Gregorian dates.

Typing changes for Gregorian fields too:

- `onChange` fires while typing only once the date is complete, and once for each date, so partial input such as `12/0` or `12/01/202` no longer reports wrong dates. A two-digit year, such as `12/01/90`, or a date without a year commits on Enter or blur, and is read in the locale's field order. A one-digit year, such as `1/5/2`, is not a date: Enter or blur keeps it and shows it as invalid. Other text that `parseDateInput` reads still commits on Enter or blur, including a day-first date such as `13/5/2026` in `en-US`.
- A typed date outside `min`, `max`, or `dateConstraints` stays in the field with an error that names the allowed range, instead of reverting on blur. Unreadable text, a date that does not exist, and an out-of-range date each announce their own message, once.

Fixes #8958.

@nynexman4464
