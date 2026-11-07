---
'@astryxdesign/core': patch
---

[fix] `Calendar` with `numberOfMonths={2}` (and so `DateRangeInput`) and no `value` or `focusDate`: when today is on or before `max` in `max`'s month, the calendar now opens on the month before it, so `max`'s month sits in the right-hand pane, unless `min` is in that month too (the shift stops at `min`, and the calendar still opens on `max`'s month). It used to open on `[this month, next month]` with every day of the second month disabled. A field that already holds a range starting in `max`'s month still opens on that month, because a selected value decides the opening month. A single-month calendar still opens on today. (#9357)
@HelloOjasMutreja
