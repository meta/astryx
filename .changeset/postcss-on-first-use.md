---
'@astryxdesign/cli': patch
---

[perf] Every command starts about 10 ms sooner again. The theme build module, which every command loads, loaded postcss at once, through the module that reads a built theme's imports; postcss now loads only when a stylesheet's imports are read. Output does not change.

@josephfarina
