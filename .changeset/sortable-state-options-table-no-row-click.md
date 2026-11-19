---
'@astryxdesign/core': patch
---

[docs] The useTableSortableState docs say that arrays and plain objects have no sort text, so they need a comparator, and that a Date sorts by its time and an Invalid Date sorts with the missing values. A new useTableSortable example sorts by a status rank and a tags array. The Table answer's first paragraph says Table has no onRowClick prop and that you act from the main cell's renderCell. No API or behavior changes.

@josephfarina
