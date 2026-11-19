---
'@astryxdesign/core': patch
---

[perf] Cache computed data attribute names in `themeDataAttributeName` and iterate props with `for...in` in `themeDataAttributes` to avoid repeated regex matching and entries allocations during render.

@TbhVishal
