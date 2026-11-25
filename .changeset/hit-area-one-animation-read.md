---
'@astryxdesign/core': patch
---

[perf] On a touch screen, a list's hit areas update with one read of the list's animations, not one per row. The page no longer recalculates its styles once for each row the update writes.

@vjeux
