---
'@astryxdesign/core': patch
---

[feat] A `LayoutPanel` that takes a `useResizable` region in its `resizable` prop slides closed and open from the edge facing its `ResizeHandle` when the region collapses or opens, under every pointer, with the content beside it moving on the same motion: through `collapse()`, `expand()`, Enter, a double-click, the grow arrow, a controlled `isCollapsed`, or a lift past the collapse threshold. A drag that reopens the panel follows the pointer, and Reduce Motion is honored. A hand-built `ResizableProps` object does not slide. No prop or option is added.

@vjeux
