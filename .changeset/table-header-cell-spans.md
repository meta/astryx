---
'@astryxdesign/core': patch
---

[feat] `TableHeaderCell` accepts `colSpan` and `rowSpan`, as `TableCell` does, so a group header (`scope="colgroup"` or `"rowgroup"`) can span its columns or rows without a type error. Both reach the native `th`.

@cixzhang
