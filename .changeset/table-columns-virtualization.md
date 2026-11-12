---
'@astryxdesign/core': patch
---

[feat] Tables can window their columns: pass `useTableColumnsVirtualization({initialViewportWidth})` to `Table.virtualization`. Table keeps every column definition and width, mounts only the unpinned columns near the inline viewport plus two overscan columns per side, keeps pinned columns mounted, and gives mounted cells full-table `aria-colindex` values with `aria-colcount` on the table. When the scroll area is at least as wide as the table's minimum width, every column mounts. `Table.virtualization` also accepts a list with at most one rows and one columns capability; with both, this release windows the rows and renders every column. In this release, focus in an unpinned column is lost when the column scrolls out of the window, and column changes do not keep the first visible column in place. Unsupported content or structure renders every column with a development warning. Adding or removing the columns capability remounts the table. Tables that do not opt in render as before; their Table import carries about 0.4 KB gzip of column windowing wiring, and the column planner loads only with the hook.

@humbertovirtudes
