---
'@astryxdesign/core': patch
---

[fix] SegmentedControl: where the control has no layout, as in a unit test's DOM, a click on a later segment keeps that segment selected instead of switching to the first segment a moment later. Browsers are unaffected.

@cixzhang
