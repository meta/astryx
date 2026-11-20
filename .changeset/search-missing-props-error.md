---
'@astryxdesign/core': patch
---

[fix] In development, these components throw an error that names the missing prop and shows the fix, instead of a TypeError from inside the component: `Tokenizer` without `value`, `PowerSearch` without `config` or `filters`, `PowerSearchFilterEditor` and `PowerSearchToken` without `config`, `TypeaheadItem` without `item`, and `ComplexSelector` without a `children` function. Production output is unchanged.

@josephfarina
