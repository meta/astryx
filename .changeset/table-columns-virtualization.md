---
'@astryxdesign/core': patch
---

[feat] Tables can window their columns: pass `useTableColumnsVirtualization({initialViewportWidth})` to `Table.virtualization`. Table keeps every column definition and width, mounts only the unpinned columns near the inline viewport plus two overscan columns per side, keeps pinned columns mounted, and gives mounted cells full-table `aria-colindex` values with `aria-colcount` on the table. When the scroll area is at least as wide as the table's minimum width, every column mounts. `Table.virtualization` also accepts a list with at most one rows and one columns capability; with both, this release windows the rows and renders every column. Unsupported content or structure renders every column with a development warning. Tables that do not opt in are unchanged.

@humbertovirtudes
