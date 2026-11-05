---
'@astryxdesign/core': patch
---

[fix] `TimeInput` and `DateTimeInput`: a bound with no whole minute inside the range keeps its own seconds, so the clamp stays inside the range. Before, `clampTime('12:00','23:59:30')` answered `23:59` — below the minimum the caller set — and a wheel rest past such a bound committed nothing. (#10159)
@aashish254
