---
'@astryxdesign/core': patch
---

[fix] Slider: with `valueDisplay="text"`, the track no longer changes length as the value text changes (for example from 90 to 100), so a dragged thumb stays under the pointer. The text reserves the width of its widest value at the ends of the range and uses tabular figures.

@cixzhang
