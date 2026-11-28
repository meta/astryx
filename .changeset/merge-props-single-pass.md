---
'@astryxdesign/core': patch
---

[perf] Merge props in a single pass in `mergeProps` to eliminate multiple intermediate object clones and array allocations during render.

@TbhVishal
