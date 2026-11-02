---
'@astryxdesign/core': patch
---

[fix] Typing a numeric date into `DateInput` or `DateTimeInput` no longer reports month-first dates on the way in day-first locales: numeric text that is not yet a full date in the locale's order is not read as a date.

@duytbp
