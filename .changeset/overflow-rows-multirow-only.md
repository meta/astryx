---
'@astryxdesign/core': patch
---

[perf] A single-line `OverflowList` renders once on mount, not twice: it no longer tracks the row count and item height that only its multi-row form (`maxRows` above 1) renders from. The public `useOverflow` hook is unchanged and still reports both on every path.

@vjeux
