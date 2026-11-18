---
'@astryxdesign/core': patch
---

[fix] Slider: with `valueDisplay="text"`, the track keeps its length while the value changes (for example from 90 to 100, or by steps of 0.1), so a dragged thumb stays under the pointer. The text reserves the width of the values at and one step in from each end of the range and uses tabular figures. A custom `formatValue` whose widest text falls mid-range still widens the box when that value shows.

@cixzhang
