---
'@astryxdesign/core': patch
---

[fix] Under a finger, a Switch or InfoTip measured while an ancestor is scaled keeps the touch insets of its unscaled layout. Before, that measurement kept the scaled frame's insets until the next resize.

@vjeux
