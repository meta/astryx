---
'@astryxdesign/core': patch
---

[fix] ComplexSelector: a caller's `aria-label` or `aria-labelledby` now names the built-in trigger, replacing the field label, as it already did for a `renderTrigger` control. Before, the built-in trigger always took its name from the label, so a name passed to the selector was never announced.

@cixzhang
