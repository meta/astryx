---
'@astryxdesign/core': patch
---

[docs] When a Table column has a custom `renderCell`, row virtualization turns off for the whole table. The development warning now names that column, says why (Table cannot check that a custom cell keeps the fixed row height) and says what stays windowed: columns without `renderCell`, and the row-number and selection columns. `astryx component useTableRowsVirtualization` says the same.

@cixzhang
