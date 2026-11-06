---
'@astryxdesign/core': patch
---

[fix] Animated layout: on iOS Safari, an Astryx gesture on gliding content goes to what is drawn under the finger. Gestures here are gesture recognizers, long presses, and Switch, Slider and SegmentedControl presses. Before, such a touch went to the element that sat under the finger when the glide started. A plain tap that no Astryx gesture handles still goes to that element until the glide ends, at most the theme's move duration. (#10239)

@vjeux
