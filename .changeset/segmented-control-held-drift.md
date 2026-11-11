---
'@astryxdesign/core': patch
---

[fix] SegmentedControl: a finger held on the control, then dragged straight down and along it, still selects the segment under it at the lift. The browser no longer takes the held finger for a page scroll. A vertical swipe that starts at once still scrolls the page.

@vjeux
