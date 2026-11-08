---
'@astryxdesign/core': patch
---

[feat] A `ResizeHandle` pulled past its region's maximum, or under its minimum, now moves the edge with resistance, and the edge springs back to the limit after the lift. A collapsible region no longer collapses mid-drag: the lift collapses it when the pointer is past `collapsedSize`, or released fast enough to come to rest past it, and a `LayoutPanel`'s pane slides shut on a spring from the release velocity. Any other lift under the minimum returns to the minimum. Reduce Motion lands both at once.

@vjeux
