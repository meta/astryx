---
'@astryxdesign/core': patch
---

[fix] Calendar: day numbers and week numbers now use the locale's digits, the same as the month heading. Under `InternationalizationProvider locale="fa-IR"` the days read `۱ ۲ ۳…`, and under `"ar-EG"` they read `١ ٢ ٣…`; English is unchanged. The month panes of DateInput's touch calendar follow the same rule. The dates themselves do not change: each number is still the Gregorian day.

@nynexman4464
