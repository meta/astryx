---
'@astryxdesign/core': patch
---

[fix] `Calendar` and `DateRangeInput` no longer cause a hydration mismatch when the server and the browser are on different dates, for example a UTC server and a visitor already in tomorrow. Today is read only after hydration: a server-rendered Calendar shows no today marker until then, and a Calendar with no `focusDate` or value keeps its month grid's space empty until the browser's month is known. A DateRangeInput shows the year in its range text until then.

@cixzhang
