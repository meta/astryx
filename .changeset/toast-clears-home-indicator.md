---
'@astryxdesign/core': patch
---

[fix] A bottom toast now keeps its 16 px gap above the bottom safe-area inset instead of sitting on the inset's edge. Under a coarse pointer it clears at least 34 px plus that gap, even on a page that reports no inset (Safari reports one only with `viewport-fit=cover`). (#8047)

@vjeux
