---
'@astryxdesign/core': patch
---

[fix] `Badge` is as wide as its label. A badge alone in a `Grid` cell or a `VStack` no longer stretches into a bar across the cell or the stack; in a crowded `HStack` it still shrinks and ends its label with an ellipsis.

@josephfarina
