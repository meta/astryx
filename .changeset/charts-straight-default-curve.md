---
'@astryxdesign/charts': patch
---

[fix] `line()`, `area()` and `band()` join points with straight segments by default. They were smoothed (`'monotone'`), which drew values between points that are not in the data. To keep a smooth line or area, pass `curve: 'monotone'`.

@josephfarina
