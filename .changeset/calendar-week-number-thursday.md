---
'@astryxdesign/core': patch
---

[fix] Calendar: with `hasWeekNumbers`, each row shows the ISO 8601 week number of its Thursday, the ISO week that holds most of its days. Before, most rows that start on Sunday or Saturday showed the previous ISO week, so the first two rows of a month could show the same number. Rows that start on Monday are unchanged.

@nynexman4464
