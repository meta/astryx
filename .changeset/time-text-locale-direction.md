---
'@astryxdesign/core': patch
---

[fix] TimeInput and DateTimeInput show their time and date text in the direction of the locale that formats it, so an English time reads "9:00 AM", not "AM 9:00", on a right-to-left page. A right-to-left locale now reads right to left on a left-to-right page too: with `he-IL`, a 12-hour time shows "PM 2:30" and a date takes Hebrew order. The field's layout, such as the icon side and the text's alignment, still follows the page.

@cixzhang
