---
'@astryxdesign/core': patch
---

[feat] Table: `useTableRowExpansion` takes an `animatedLayout` handle from `useAnimatedLayout`. With it, opening or closing a row's panel glides the rows after it to their new places instead of jumping, and each row's divider moves with its row. Under Reduce Motion the rows fade in place on a touch screen and change at once with a mouse; in a table with column lines (`dividers="columns"` or `"grid"`) they change at once.

@cixzhang
