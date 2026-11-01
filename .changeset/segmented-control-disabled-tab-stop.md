---
'@astryxdesign/core': patch
---

[fix] SegmentedControl: a disabled control, or a disabled selected segment, keeps the control's Tab stop. Before, a control disabled without a `disabledMessage` had no Tab stop and ignored the pointer. A selected segment that was itself disabled lost the stop to another segment, and once the stop had moved there, selecting a third segment left it behind, so Tab re-entered on an unchecked segment. Now the selected segment always holds the one Tab stop, announced as disabled (`aria-disabled`) when it is, and nothing can be selected while disabled.

@cixzhang
