---
'@astryxdesign/core': patch
---

[fix] Under a finger or pen, holding a control or a cell that shows the touch press (the press feedback surfaces) no longer starts text selection or the iOS callout, as on UIKit controls. Selection and the callout come back when the finger lifts. Text fields keep their selection, a link keeps its native menu and preview, and a mouse keeps desktop selection.

@vjeux
