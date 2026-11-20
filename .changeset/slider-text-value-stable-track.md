---
'@astryxdesign/core': patch
---

[fix] Slider: with `valueDisplay="text"`, the track keeps its length while the value changes (for example from 90 to 100, or by steps of 0.1) in fonts with tabular figures, so a dragged thumb stays under the pointer. When every value has the same characters around its digits (a unit such as "°F"), the text pads only the digits it lacks, so it is exactly as wide as the widest end value and reserves no blank space. When those characters differ (a decimal point at some values), it reserves the width of the values at and one step in from each end. A value shown as words reserves nothing, as before. In a font whose digits are neither tabular nor no wider than its zero, the track can still shift by a pixel or two.

@cixzhang
@AKnassa
