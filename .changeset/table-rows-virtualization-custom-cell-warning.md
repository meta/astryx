---
'@astryxdesign/core': patch
---

[docs] When a Table column has a custom `renderCell`, row virtualization turns off for the whole table, because Table cannot check that the cell keeps the fixed row height. The development warning now names that column and says what stays windowed: columns without `renderCell`, the selection column, and a row-number column that counts from 1. When a `useTableRowStatus` column, or a `useTableRowIndex` column that counts from another number, turns windowing off, the warning names that plugin column instead. `astryx component useTableRowsVirtualization` says the same.

@cixzhang
