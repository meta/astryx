---
'@astryxdesign/core': patch
---

[fix] Calendar, DateRangeInput: a two-month calendar whose `max` falls in the month it would open on now opens with that month in the second pane. Before, with `max` set to today, or with a selected value starting in `max`'s month, it opened on that month and the next one, and every day of the next month was disabled while the previous month stayed hidden. The first pane still never goes before `min`'s month, an explicit `focusDate` is shown as given, and a one-month calendar is unchanged.

@Varshavia
