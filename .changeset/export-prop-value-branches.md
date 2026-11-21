---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental export`'s `unknown-prop-value` warning also checks each branch of a conditional prop value whose branches are all string literals: `<Button variant={busy ? 'ghost' : 'danger'}>` warns that Button has no variant "danger". A branch that is `null` or `undefined` gives no value; a value with a branch the export cannot be certain of (a parameter, a call) is not checked.

@josephfarina
