---
'@astryxdesign/cli': patch
---

[perf] A run that keeps many values trims the per-user catalogs folder once, when it ends (a command that fails trims it as it exits), instead of after each value. A first `theme build` on a fresh cache keeps about 270 values and is about 130 ms faster. Every answer is unchanged, and the folder keeps the same size limit.

@josephfarina
