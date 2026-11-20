---
'@astryxdesign/core': patch
---

[docs] The useTableSortable doc now says in its first sentence that the plugin adds the header sort controls but does not reorder the rows, and shows two ways to sort the data: from the sort state yourself, or with useTableSortableState. It also says a column needs `sortable` to get a control, and gives the correct default of `allowUnsortedState` (`true`). No API or behavior changes.

@josephfarina
