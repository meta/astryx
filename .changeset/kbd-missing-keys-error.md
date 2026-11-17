---
'@astryxdesign/core': patch
---

[fix] In development, `Kbd` without a `keys` string (for example with children, or an array) throws an error that names the prop and shows the fix, instead of "Cannot read properties of undefined (reading 'split')". Production output is unchanged.

@josephfarina
