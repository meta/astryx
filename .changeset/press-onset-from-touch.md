---
'@astryxdesign/core': patch
---

[fix] Inside a scroll view, a pressable's highlight now comes 150 ms after the touch, even when a busy page handles the touch late. Before, the wait started when the page handled the touch, so the highlight came late by that delay. This covers every pressable, and SegmentedControl, Switch, Slider and `usePressTracker` controls, in a scroll view.

@vjeux
