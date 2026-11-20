---
'@astryxdesign/cli': patch
---

[perf] `astryx component` and the `astryx theme` commands start about 5–10 ms sooner again. The theme build module they load loaded postcss at once, through the module that reads a built theme's imports; postcss now loads only when a stylesheet's imports are read. The font stylesheet reader uses the same first-use postcss. Output does not change.

@josephfarina
