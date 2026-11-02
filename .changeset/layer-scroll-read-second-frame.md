---
'@astryxdesign/core': patch
---

[fix] On a busy page, a tooltip carried by a scroll is now corrected by the second painted frame. When the page was too busy to report the trigger's move in time, a scrolled tooltip could stay past the edge of the screen or over its trigger for an extra frame or more; the scroll itself now prompts the correction.

@vjeux
