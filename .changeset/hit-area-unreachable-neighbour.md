---
'@astryxdesign/core': patch
---

[fix] Under a finger, a tap on a control's grown touch area runs the control when the nearer neighbour is disabled, inside an `inert` subtree, hidden by `visibility` or by skipped content, or has `pointer-events: none`. Before, such a neighbour counted as nearer, so every tap at that spot was swallowed. A neighbour that takes taps, including one drawn at opacity 0, still keeps a tap nearer it. So does a neighbour under another element, or behind an open modal dialog.

@vjeux
