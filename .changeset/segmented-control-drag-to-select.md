---
'@astryxdesign/core': patch
---

[feat] SegmentedControl: under a finger, on a touch device (a coarse primary pointer), the control tracks the touch. Dragging the selected segment carries the selection along with the finger, and the segment under the finger is chosen when it lets go (`onChange` fires once, at the lift); letting go outside the control selects nothing. While the selection is dragged, the selected label's colour follows it, with a margin around each boundary so a finger resting on one never flickers; label weights change only at the lift, so nothing reflows under the finger. A tap selects through the browser's own click, and a pressed segment shows the shared pressed overlay; nothing lifts or dims. A vertical drag that starts on the control still scrolls the page. A commit the item's `onClick` vetoes sends the selection back at once; one a controlled parent adopts later lands without a bounce. With Reduce Motion the selection still follows the finger, with no chase, and only the lift cross-fades. Keyboard and assistive technology keep the click; no element is added.

@vjeux
