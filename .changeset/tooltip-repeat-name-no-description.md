---
'@astryxdesign/core': patch
---

[fix] Tooltip: a `Tooltip` around an element, or on an `anchorRef` target, whose text repeats that element's accessible name (its `aria-label`, else its text) no longer describes it with the same words, so a screen reader reads them once, as with Button's `tooltip` prop. Other text still describes the trigger, and so does a tooltip on a trigger named by `aria-labelledby` or on a plain text child. A Thumbnail named only by its `label` is no longer described by the same label.

@cixzhang
