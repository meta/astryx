---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[feat] Table plugins can now read where a row sits. Table passes each body row and cell transform an immutable `TableRowContext` (the row's key, its zero-based `logicalIndex` in the complete data, the row and header counts, and the row model). It passes the scroll-wrapper transform a `TableRenderContext` with a stable `viewport` reference. A plugin declares `rowModel: 'flat'` when its body transforms keep one row per data item. `useTableSelection` and `useTableStickyColumns` declare it. `useTableRowIndex()` without options now numbers rows from the context (passing `data` still numbers from that array), and rows that move re-render only for plugins that read the index. Read context values during the transform; a later read from a callback warns in development. The CLI's numbered-rows block no longer passes `data`.

@cixzhang
