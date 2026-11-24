---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[docs] The `useLayer` and `Popover` docs and the browser support guide say what a layer loses in a browser without the `Popover` API. It then opens in place, without the top layer, so content with a higher `z-index`, or a transformed ancestor, can cover or clip it. No behavior change.

@vjeux
