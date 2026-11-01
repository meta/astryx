---
'@astryxdesign/core': patch
---

[fix] `Calendar` with `numberOfMonths={2}` (and so `DateRangeInput`): when `max` falls in the current month, the calendar now opens on the month before it, so `max`'s month sits in the right-hand pane. It used to open on `[this month, next month]` with every day of the second month disabled. A single-month calendar still opens on today.

@HelloOjasMutreja
