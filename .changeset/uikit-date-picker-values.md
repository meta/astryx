---
'@astryxdesign/core': patch
---

[chore] Internal: the rules UIDatePicker adds to its wheels, measured on iOS 26.2, join the UIKit constants table: the month/year wheels changing the date, the AM/PM column following the hour, the turn back onto a bound, and the day clamped to the month. Each rule comes with its source. None is exported from the package entry point. (#8178)

@vjeux
