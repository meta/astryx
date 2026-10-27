---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[chore] The UIKit constants table gains ContextMenu's touch timeline as measured on iOS 26.2: the press feedback starts at 150 ms, the press commits at 400 ms, and the menu displays at 735 ms. It also records the drift tolerance, and the press feedback's growth, spring and display latency. A closed-form press-feedback curve, checked against UIKit's per-frame presentation, comes with them. ContextMenu's touch timeline uses them.

@vjeux
