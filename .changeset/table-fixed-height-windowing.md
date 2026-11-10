---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[feat] Tables can window fixed-height flat data: pass `useTableRowsVirtualization({rowHeight, initialViewportHeight})` to `Table.virtualization`. Table keeps the complete data and row identity, mounts only the rows in its viewport plus a few overscan rows, keeps native table semantics with full-table row positions, keeps the focused row mounted, and falls back to rendering every row for content or geometry it cannot window. Tables that do not opt in are unchanged.

@humbertovirtudes
