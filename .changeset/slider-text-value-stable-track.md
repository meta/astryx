---
'@astryxdesign/core': patch
---

[fix] Slider: with `valueDisplay="text"`, the track keeps its length while the value changes (for example from 90 to 100, or 60°F to 90°F) in fonts with tabular figures, so a dragged thumb stays under the pointer. When every value has the same characters around its digits, the text pads only the digits it lacks, so it is exactly as wide as the widest end value. A value shown as words, or one whose decimal point comes and goes, keeps its own width, as before. In a font whose digits are neither tabular nor no wider than its zero, the track can still shift by a pixel or two.

@cixzhang
@AKnassa
