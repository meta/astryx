---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[docs] The `useLayer` and `Popover` docs and the browser support guide say a layer has no top layer without the `Popover` API. It opens in place, without the top layer, so content with a higher `z-index` can cover it. A layer anchored to a trigger stays in the page flow, where an ancestor that clips overflow can clip it. A transformed ancestor can move and clip a fixed-position layer. No behavior change.

@vjeux
