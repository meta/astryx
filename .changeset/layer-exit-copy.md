---
'@astryxdesign/core': patch
---

[chore] Internal: the layer runtime gains one exit copy for touch presentations that animate a popover out: a static, inert copy of the closing popover, shown only in the top layer where the popover was drawn, for the close to play on.

@vjeux
