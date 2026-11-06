---
'@astryxdesign/core': patch
---

[perf] While a Tooltip or another anchored layer plays its entrance, the layer runtime reads the layer's box without writing styles to it. Before, each read during the entrance overrode the layer's transform, read the box and put the transform back, so the browser recomputed style and layout twice in that frame (measured in Chromium: 8 style writes, 2 style recalculations and 2 layouts per read). Now, while the entrance runs, the box comes from one read with the entrance transform taken out by calculation, and it is the same box. The read in the call that shows the layer, a layer under a CSS `zoom` other than 1, and a `translate` given as a percentage still use the override, as before. Placement, the entrance animation and the keyboard cap do not change.

@cixzhang
