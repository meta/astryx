---
'@astryxdesign/core': patch
---

[fix] Slider: with `valueDisplay="text"`, the track keeps its length while the value changes (for example from 90 to 100, or by steps of 0.1) in fonts with tabular figures, so a dragged thumb stays under the pointer. In a font whose digits are neither tabular nor no wider than its zero, the track can still shift by a pixel or two. The text reserves the width of the values at and one step in from each end of the range and uses tabular figures. A custom `formatValue` whose widest text falls mid-range still widens the box when that value shows.

@cixzhang, building on @AKnassa's earlier reservation in characters (#4050)
