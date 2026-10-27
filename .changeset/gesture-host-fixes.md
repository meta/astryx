---
'@astryxdesign/core': patch
---

[chore] Internal: gesture host fixes from review. A page scroll under a still finger keeps the press and its click; watchers and touches nothing can claim get passive listeners only; a claimed pen holds only its own stylus touches; an element's own `touch-action` is never widened; slotted content scrolls with its shadow-tree scroller. Not exported from the package entry point.

@vjeux
