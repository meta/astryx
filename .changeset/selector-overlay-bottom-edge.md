---
'@astryxdesign/core': patch
---

[fix] A Selector whose trigger sits near the bottom of the screen now opens its list on screen. The selected-item overlay's clamp did not count the layer's viewport gutter, so near the bottom edge the browser flipped the list below the viewport and its last options could not be reached.

@cixzhang
