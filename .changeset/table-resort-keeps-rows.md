---
'@astryxdesign/core': patch
---

[perf] Table: re-sorting no longer re-renders every row when no plugin uses the row's position. Rows only move; on a 1,000-row table this is about a tenth of the work a sort click does. Plugins that read the row index (through a body-row transform) still re-render their rows.

@cixzhang
