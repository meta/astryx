---
'@astryxdesign/core': patch
---

[fix] BottomSheet: an open sheet that renders again no longer reads the viewport height. It keeps the viewport height that its `resize` listener reads, so a tap that renders the sheet again forces no style recalculation or layout in React's commit. The sheet's height, reserve and detents are unchanged.

@vjeux
