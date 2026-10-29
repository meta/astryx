---
'@astryxdesign/core': patch
---

[fix] Selector: a caller's `aria-labelledby` now reaches the trigger. Before, Selector replaced it with its own value, so the trigger lost the extra name (standalone it had no `aria-labelledby` at all). Now the caller's ids follow the field's own label: `label="Fruit" aria-labelledby="lunch-heading"` names the trigger "Fruit Lunch", and inside an InputGroup the group label comes first. Triggers without a caller `aria-labelledby` are unchanged. No API changes.

@kyu-rong
