---
'@astryxdesign/core': patch
---

[fix] In `Calendar` and the calendar popovers of `DateInput`, `DateRangeInput` and `DateTimeInput`, Shift+Page Up and Shift+Page Down now move the focused day to the same date in the previous or next year (clamped to the month's last day, within `min` and `max`), as the APG date picker pattern describes. Page Up and Page Down still move a month.

@duytbp
