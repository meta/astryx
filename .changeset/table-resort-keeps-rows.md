---
'@astryxdesign/core': patch
---

[perf] Table: when nothing in a table depends on a row's position, re-sorting it no longer re-renders every row; the rows only move. On a 1,000-row table this is about a tenth of the work a sort click does. This applies to a table that has an `idKey`, sets neither `rowCount` nor `rowIndexStart`, and uses neither `useTableRowIndex` nor a plugin that transforms body rows (selection, row expansion, grouped rows, tree data). Those tables still re-render their rows on a sort.

@cixzhang
