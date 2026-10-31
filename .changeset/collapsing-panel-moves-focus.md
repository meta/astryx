---
'@astryxdesign/core': patch
---

[fix] When a `LayoutPanel` beside a `ResizeHandle` collapses with focus inside it, focus moves to the handle, and the collapsed panel is inert and hidden from assistive technology until it opens, instead of keeping focus, and a Tab stop, in a panel of no width. This holds for the `useResizable(handleRef, options)` form and for the `resizable` props, whether the hook's own or a hand-built object. A collapse started from the handle or from outside the panel keeps focus where it is.

@vjeux
