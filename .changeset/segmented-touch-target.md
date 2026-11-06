---
'@astryxdesign/core': patch
---

[fix] Under a coarse pointer, a `SegmentedControl` segment's touch target grows toward 44 px through an invisible hit area, stopping halfway to a neighbor. No segment changes size, and nothing changes under a mouse. (#10137)

@cixzhang
