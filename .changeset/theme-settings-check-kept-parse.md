---
'@astryxdesign/cli': patch
---

[perf] A `theme build` of an unchanged theme reads back what its check of settings that do not show as written parsed last time, and loads no css-tree. A warm build of a theme with component styles is about 46 ms faster. Every answer is unchanged.

@josephfarina
