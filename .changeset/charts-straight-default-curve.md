---
'@astryxdesign/charts': patch
---

[fix] `line()` and `area()` join points with straight segments by default (`curve: 'linear'`). They were smoothed (`'monotone'`), which drew values between points that are not in the data. To keep the smooth look, pass `curve: 'monotone'`.

@josephfarina
