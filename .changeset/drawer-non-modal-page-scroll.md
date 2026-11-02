---
'@astryxdesign/core': patch
---

[fix] Under a finger in Chrome, the page beside an open non-modal `Drawer` (`hasScrim={false}`) scrolls again. The panel clipped its content with `overflow: hidden`, which made it a scroll container, and Chrome held a drag on the page beside it in that container's overscroll containment, so the page did not move. It now clips with `overflow: clip`, which clips the same way without a scroll container. The panel's content area still scrolls on its own, and a modal drawer is unchanged.

@vjeux
