---
'@astryxdesign/core': patch
---

[docs] The Toast doc now says in its first sentence that `useToast()` needs no provider or mounted ToastViewport. The Table hooks whose config does not mention the row type (useTableSortable, useTablePagination, useTableFiltering, useTableColumnSettings, useTableColumnResize, useTableInfiniteScroll, useTableStickyColumns) now say that `T` is the row type, that TypeScript cannot infer it and falls back to `Record<string, unknown>`, and that you pass it, as in `useTableSortable<Walk>(…)`. Their examples are typed. No API or behavior changes.

@josephfarina
