---
'@astryxdesign/core': patch
---

[fix] `parseColor` answers `null` for `constructor` and `__proto__` (in any case), as for any unknown name, instead of a truthy empty RGBA that made composed callers such as chart `colors.alpha` return `rgba(NaN, NaN, NaN, …)` (or `#NANNANNAN` at full opacity) instead of the original string (#10468)
@aashish254
