---
'@astryxdesign/cli': patch
---

[fix] The `dashboard-scorecard` and `dashboard-progress` templates draw their trend lines as straight segments between the real points, so a chart no longer shows values between days that were never measured.

@josephfarina
