---
'@astryxdesign/core': patch
---

[chore] Internal: `usePanGesture` copies `onPan` into its ref at commit, not during render, before the hook's first release. A render React discards, as a suspended transition does, no longer hands the next drag to its `onPan`.

@vjeux
