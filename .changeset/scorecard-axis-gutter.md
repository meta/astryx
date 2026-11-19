---
'@astryxdesign/cli': patch
---

[fix] The dashboard scorecard template's trend charts keep their y-axis labels whole with a small font up to 16 px, wide fonts included: the labels are compact and in the series' own scale ("6M" and "1.4M" for values stored in thousands, matching the heading's "4,350k") instead of 6000 and 1400, and the axis gutter is 52 px instead of 40 px. The tooltip still shows exact values.

@josephfarina
