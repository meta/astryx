---
'@astryxdesign/core': patch
---

[fix] Toolbar lets a two-slot start lane containing an OverflowList with `behavior='observeParent'` shrink below min-content so overflowing actions collapse beside endContent and expand again when space returns, while wrapping fixed start lanes onto a new line at narrow widths instead of pushing endContent past the edge.
@quocluongg
