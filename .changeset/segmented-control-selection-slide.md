---
'@astryxdesign/core': patch
---

[feat] SegmentedControl: under a finger the selection slides to the new segment on UIKit's spring, whether a tap, an arrow key or a new `value` moved it. The selection indicator is the control's own pseudo-element, so no element is added. The motion runs on the compositor and keeps moving while the main thread is busy. With Reduce Motion nothing travels or scales: the old selection fades out where it is as the new one fades in. The spring is UIKit's measured one, an internal motion role no theme retunes, and no theme value lengthens the Reduce Motion fade. With a mouse or a pen it slides on the theme's duration and easing instead.
@vjeux
