---
'@astryxdesign/core': patch
---

[fix] SegmentedControl keeps a caller's `aria-describedby`. The radiogroup always replaced it with the disabled-reason tooltip id, or removed it when no reason showed, so the caller's ids never reached the accessible description. The group is now described by the caller's ids and then the disabled reason, the same order RadioList uses.

@kyu-rong
