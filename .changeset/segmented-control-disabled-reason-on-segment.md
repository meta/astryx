---
'@astryxdesign/core': patch
---

[fix] SegmentedControl: a control disabled with a `disabledMessage` gives that reason to each segment as its description (`aria-describedby`), as well as to the group, so a screen reader announces it on the segment that has focus. The control also always keeps one Tab stop: the selected segment, even when it is itself disabled, else the first segment not disabled on its own, else the first.

@cixzhang
