---
'@astryxdesign/core': patch
---

[fix] Calendar: Shift+Page Up and Shift+Page Down now move the focused day to the same date one year earlier or later, as in the WAI-ARIA date picker pattern, instead of one month. A February 29 lands on February 28 in a year without one. The year step follows the same rules as Page Up and Page Down: it changes nothing past `min` or `max`, and on a day that `dateConstraints` disables it focuses that month's first enabled day.

Fixes #8947.

@nynexman4464
