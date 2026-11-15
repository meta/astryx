---
'@astryxdesign/cli': patch
---

[perf] `astryx component`, `astryx theme build` and the other commands that load the theme build module start about 10 ms sooner again. That module loaded postcss at once, through the module that reads a built theme's imports; postcss now loads only when a stylesheet's imports are read. The font stylesheet reader uses the same first-use postcss. Output does not change.

@josephfarina
