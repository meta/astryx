---
'@astryxdesign/core': patch
---

[fix] `clampTime` without seconds now gives the nearest whole minute inside a bound that falls between minutes. Before, `clampTime('08:00', '09:00:30')` gave `09:00`, a time outside the range.

@vjeux
