---
'@astryxdesign/core': patch
---

[fix] Outline's scroll spy reads its items, its `onActiveIdChange` and its active item as committed. A render React discards, as a suspended transition does, no longer changes which item a scroll marks or which callback a landed navigation calls.

@vjeux
