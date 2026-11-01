---
'@astryxdesign/core': patch
---

[perf] Table: re-sorting a table with `idKey` no longer re-renders every row; the rows only move. On a 1,000-row table this is about a tenth of the work a sort click does. Rows still re-render on a sort when the table sets `rowCount` or `rowIndexStart` (each row's `aria-rowindex` changes), has no `idKey` (rows are keyed by position), or uses a plugin that transforms body rows (selection, row expansion, grouped rows, tree data), whose transform receives the row index.

@cixzhang
