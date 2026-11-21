---
'@astryxdesign/core': patch
---

[perf] `themeDataAttributes` iterates props with `for...in` instead of `Object.entries`, so it no longer allocates an entries array on each render.

@TbhVishal
