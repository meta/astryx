---
'@astryxdesign/core': patch
---

[perf] A single-line `OverflowList` no longer renders again after mount only to record an item height it never shows: it does not track the row count and item height that only its multi-row form (`maxRows` above 1) renders from. One whose items all fit now renders once on mount; one that collapses items still renders again for the new visible count. The public `useOverflow` hook is unchanged and still reports both on every path.

@vjeux
