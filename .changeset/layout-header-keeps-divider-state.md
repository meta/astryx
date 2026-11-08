---
'@astryxdesign/core': patch
---

[fix] `LayoutHeader`: a `data-divider` attribute passed by the caller no longer replaces the divider state the header reflects, so the content below a header without a divider keeps its collapsed spacing, and a header with a divider keeps its spacing below the line. The docs now list `padding` and `ref`, and say that an unset `hasDivider` follows the Layout's `defaultHasDividers`.

@cixzhang
