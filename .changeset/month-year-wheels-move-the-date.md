---
'@astryxdesign/core': patch
---

[fix] Under a finger, the month and year wheels behind the calendar title in the DateInput and DateTimeInput bottom sheets now behave like the iOS date picker's:

- Turning a wheel moves a chosen date to the new month and keeps its day, so October 15 becomes May 15. A day the month lacks becomes its last day, the result stays within `min` and `max`, and DateTimeInput keeps the time. A date that `dateConstraints` refuses is not chosen; the calendar still moves.
- With no date chosen, the wheels only move the calendar.

With a mouse, the wheels still move only the calendar.

@vjeux
