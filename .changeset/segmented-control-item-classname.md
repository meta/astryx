---
'@astryxdesign/core': patch
---

[fix] SegmentedControlItem: a `className` passed to a segment now joins the segment's own classes instead of being dropped, so app styles and selectors written for that class reach the segment.

@cixzhang
