---
'@astryxdesign/core': patch
---

[fix] SegmentedControl: a finger held on the control, then dragged straight down and along it, still selects the segment under it at the lift. The browser no longer takes the held finger for a page scroll. Inside scrolling content, a vertical swipe that starts at once still scrolls the page. Where the control is not in a scroll view, such as a fixed bar, its press shows at touch-down, so it keeps the finger and a vertical swipe chooses by its position along the control.

@vjeux
