---
'@astryxdesign/core': patch
---

[fix] TimeInput and DateTimeInput show their time and date text in the direction of the locale that formats it, so an English time reads "9:00 AM", not "AM 9:00", on a right-to-left page. The field's layout, such as the icon side and the text's alignment, still follows the page.
