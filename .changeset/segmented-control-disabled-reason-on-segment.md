---
'@astryxdesign/core': patch
---

[fix] SegmentedControl: a control disabled with a `disabledMessage` gives that reason to each segment as its description (`aria-describedby`), as well as to the group, so a screen reader announces it on the segment that has focus. It also keeps one Tab stop when no enabled segment is selected (the value matches no segment, or the selected segment is itself disabled): the first enabled segment, else the first.

@cixzhang
