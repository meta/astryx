---
'@astryxdesign/core': patch
---

[fix] Under a finger, a tap on a control's grown touch area runs the control when the nearer neighbour is one that no tap can reach. Before, a neighbour inside an `inert` subtree, disabled, hidden by `visibility` or by skipped content, or with `pointer-events: none` counted as nearer, so every tap at that spot was swallowed. A neighbour that takes taps, including one drawn at opacity 0, still keeps a tap nearer it.

@vjeux
