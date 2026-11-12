---
'@astryxdesign/core': patch
---

[fix] Slider: the track no longer resizes while dragging with `valueDisplay="text"`. The value text keeps the width of its longest likely label (the ends, their neighbours and the quarter points, as your `formatValue` writes them), with digits of equal width, so the thumb stays under the pointer instead of shifting as the label grows and shrinks. (#4050)
@AKnassa
