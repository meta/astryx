---
'@astryxdesign/core': patch
---

[perf] Calendar, DateInput and the other date components now reuse one date formatter per locale and format instead of building one for every label they show, so rendering a month (42 day labels) no longer builds 42 formatters.

@vjeux
