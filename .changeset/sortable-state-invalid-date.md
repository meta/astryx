---
'@astryxdesign/core': patch
---

[fix] useTableSortableState no longer throws when a sorted column holds an Invalid Date. The default comparator now treats an Invalid Date like null, undefined and NaN: it sorts last in ascending order and first in descending order.

@josephfarina
