---
'@astryxdesign/core': patch
---

[chore] Internal: press tracking imports only the UIKit timing table's press clocks, so Switch, Slider, SegmentedControl and DateTimeInput, the controls built on press tracking, no longer ship the whole table. Nothing changes in how a press behaves. (#9745)

@vjeux
