---
'@astryxdesign/core': patch
---

[feat] A `LayoutPanel` rendered at `width={region.size}` beside the `ResizeHandle` of a `useResizable(handleRef, options)` region slides closed and open from the edge facing the handle when the region collapses or opens, with the content beside it moving on the same motion: through `collapse()`, `expand()`, Enter, a double-click, the arrow keys, a controlled `isCollapsed`, or a drag past the collapse threshold. A drag that reopens the panel follows the pointer, and Reduce Motion is honored. The configuration-object hook's own `props`, passed to the panel's `resizable`, slide it the same way; a hand-built `ResizableProps` object does not. No prop or option is added.

@vjeux
