---
'@astryxdesign/core': patch
---

[fix] DateInput: a date the locale formats now reads in the locale's direction, while the text stays on the page's start side. On a right-to-left page, an English date such as "January 25, 2026" used to read "2026 ,January 25"; it now keeps its order. This covers the text field, the touch field, and the native field with its drawn date, as TimeInput and DateTimeInput already do. A caller's `dir` still wins.

@cixzhang
