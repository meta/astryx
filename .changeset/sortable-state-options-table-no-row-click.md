---
'@astryxdesign/core': patch
---

[docs] The useTableSortableState docs say that arrays and plain objects have no sort text, so they need a comparator, and that a Date sorts by its time and an Invalid Date sorts with the missing values. A new useTableSortable example sorts by a status rank and a tags array. Table's `columns` prop says Table has no onRowClick prop: to open a row, put a Link or Button in its main cell's renderCell. No API or behavior changes.

@josephfarina
