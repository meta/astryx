---
'@astryxdesign/core': patch
---

[fix] MultiSelector: a caller's `aria-labelledby` now reaches the built-in trigger. Before, MultiSelector replaced it with its own value, so the trigger lost the extra name (standalone it had no `aria-labelledby` at all). Now the caller's ids follow the field's own label: `label="Fruits" aria-labelledby="lunch-heading"` names the trigger "Fruits Lunch", and inside an InputGroup the group label comes first. With `renderTrigger`, the caller's control still receives the caller's `aria-labelledby` as given. Triggers without a caller `aria-labelledby` are unchanged. No API changes.

@kyu-rong
