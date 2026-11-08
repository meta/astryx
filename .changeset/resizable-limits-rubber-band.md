---
'@astryxdesign/core': patch
---

[feat] A `ResizeHandle` pulled past the maximum, or under the minimum, of a region whose pane a `LayoutPanel` renders now moves the edge with resistance, at most about 8 px past the limit, while the pane's content keeps its size, and the edge springs back to the limit after the lift. A panel sized by the region's `size` alone stops at the limit. A collapsible region no longer collapses mid-drag: only the lift collapses it, when the pointer is past `collapsedSize`, or released fast enough to come to rest past it, and a `LayoutPanel`'s pane slides shut on a spring from the release velocity. Any other lift under the minimum returns to the minimum. A finger that grabs the handle again catches the edge where it shows. Reduce Motion lands both at once.

@vjeux
