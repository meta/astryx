---
'@astryxdesign/core': patch
---

[fix] When a `LayoutPanel` beside a `ResizeHandle` collapses with focus inside it, focus moves to the handle, and the collapsed panel is inert and hidden from assistive technology until it opens, instead of keeping focus, and a Tab stop, in a panel of no width. This holds for a panel that takes a `useResizable` region's `resizable` props, whether the hook's own or a hand-built object, and for a panel at the region's size beside a handle given them. A collapse started from the handle or from outside the panel keeps focus where it is.

@vjeux
