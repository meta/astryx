---
'@astryxdesign/core': patch
---

[chore] Internal: the undocumented `@astryxdesign/core/internal/calendar-system` entry gives Lab's Schedule the calendar that Core's date components resolve, and the helpers that name its months, days, and date ranges as `Calendar` does. Internal entries are outside the public API and its compatibility promise.

Lab's Schedule follows that calendar. Without a provider calendar, the accessible label of a timed event that spans days now writes its dates in the Gregorian calendar; before, the dates followed the locale's default calendar, such as the Persian calendar under `fa-IR`. A locale never selects the calendar.

@nynexman4464
