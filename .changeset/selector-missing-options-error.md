---
'@astryxdesign/core': patch
---

[fix] In development, `Selector` and `MultiSelector` without an `options` array (for example with `<option>` children) throw an error that names the prop and shows the fix, instead of "options is not iterable". Production output is unchanged.

@josephfarina
