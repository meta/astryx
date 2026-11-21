---
'@astryxdesign/core': patch
---

[perf] `themeDataAttributeName` returns a lowercase prop name without running its regular expression, and `themeDataAttributes` iterates props with `for...in` instead of allocating an `Object.entries` array on each render.

@TbhVishal
