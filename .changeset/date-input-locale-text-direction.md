---
'@astryxdesign/core': patch
---

[fix] DateInput: a date the locale formats now reads in the locale's direction, while the text stays on the page's start side. On a right-to-left page, a British English date such as "25 January 2026" used to read "January 2026 25"; it now keeps its order. This covers the text field, the touch field, and the native field with its drawn date, as TimeInput and DateTimeInput already do. A caller's `dir` still wins.

@cixzhang
