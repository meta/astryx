---
'@astryxdesign/core': patch
---

[perf] While a Tooltip or another anchored layer plays its entrance, most reads of the layer's box write no styles. Before, each read during the entrance overrode the layer's transform, read the box and put the transform back, so the browser recomputed style and layout twice in that frame (measured in Chromium: 8 style writes, 2 style recalculations and 2 layouts per read). Now a read on the middle frames of an entrance takes the entrance transform out of one box read by calculation, and gets the same box. The read that shows the layer and any read while its entrance is pending, a read whose box does not yet carry the entrance (in Chromium, a layer at a fallback position), the last frames of an entrance, a layer under a CSS `zoom` other than 1, and a `translate` given as a percentage still use the override, as before. Placement, the entrance animation and the keyboard cap do not change.

@cixzhang
