---
'@astryxdesign/core': patch
---

[feat] `useResizable(handleRef, options)` makes the element behind the ref a window splitter, beside the configuration-object form: give the same ref to `ResizeHandle` (or to a plain element) and render the panel at `size`. It returns the region's size, collapse state and controls, in the commit that `onCollapseChange`'s own state lands in. A `ResizeHandle` given the ref renders the region and drives it, and a plain element is named and announced through the message catalog.

@vjeux
