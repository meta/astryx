---
'@astryxdesign/core': patch
---

[fix] `MobileNav` is never wider than 85% of the viewport, as its `width` documentation says. A 320 px drawer on a 320 px phone used to cover the whole screen and leave no backdrop to tap; it is now 272 px wide and leaves a 48 px strip of the page beside it, and a tap on that strip closes it. On wider screens the drawer keeps its `width`.

@vjeux
