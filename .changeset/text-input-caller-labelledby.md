---
'@astryxdesign/core': patch
---

[fix] TextInput: a caller's `aria-labelledby` now reaches the input. Before, TextInput replaced it with its own value, so the input lost the extra name (standalone it had no `aria-labelledby` at all). Now the caller's ids follow the field's own label: `label="Email" aria-labelledby="billing-heading"` names the input "Email Billing", and inside an InputGroup the group label comes first. Inputs without a caller `aria-labelledby` are unchanged. No API changes.

@kyu-rong
