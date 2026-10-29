---
'@astryxdesign/core': patch
---

[fix] NumberInput: a caller's `aria-labelledby` now reaches the input. Before, NumberInput replaced it with its own value, so the input lost the extra name (standalone it had no `aria-labelledby` at all). Now the caller's ids follow the field's own label: `label="Amount" aria-labelledby="shipping-heading"` names the input "Amount Shipping", and inside an InputGroup the group label comes first. Inputs without a caller `aria-labelledby` are unchanged. No API changes.

@kyu-rong
