---
'@astryxdesign/core': patch
---

[perf] Table: re-sorting no longer re-renders every row when no plugin transforms body rows. Rows only move; on a 1,000-row table this is about a tenth of the work a sort click does. A table with a body-row plugin (selection, row expansion, grouped rows, tree data) still re-renders its rows on a sort, because that transform receives the row index.

@cixzhang
