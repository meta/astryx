---
'@astryxdesign/core': patch
---

[fix] In development, `Kbd` without a `keys` string (for example with children, or an array) throws an error that names the prop and shows the fix, instead of a TypeError from inside Kbd, such as "Cannot read properties of undefined (reading 'split')" or "keys.split is not a function". Production output is unchanged.

@josephfarina
