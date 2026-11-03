---
'@astryxdesign/core': patch
---

[feat] SegmentedControl: a mouse or a pen drags the selection as a finger does. A drag from the selected segment carries it with the pointer, and the release commits the segment under the pointer (`onChange` fires once, at the release). A release outside the control selects nothing, and a drag that starts on another segment commits where it lifts. Under a mouse or a pen, every change slides the selection on the theme's duration and easing, not UIKit's spring, and a click slides it too. With Reduce Motion, a mouse's or a pen's drag still carries the selection, and its release lands at once. Keyboard and assistive technology keep the click.

@vjeux
