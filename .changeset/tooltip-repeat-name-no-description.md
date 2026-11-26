---
'@astryxdesign/core': patch
---

[fix] Tooltip: a wrapping `Tooltip` whose text repeats its trigger's accessible name (its `aria-label`, else its text) no longer describes the trigger with the same words, so a screen reader reads them once, as with Button's `tooltip` prop. Other text still describes the trigger, and so does a tooltip on a trigger named by `aria-labelledby`.

@cixzhang
