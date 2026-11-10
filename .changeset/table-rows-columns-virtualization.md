---
'@astryxdesign/core': patch
---

[feat] Tables can window rows and columns together: pass both `useTableRowsVirtualization` and `useTableColumnsVirtualization` to `Table.virtualization` as a list. Table mounts only the cells near the viewport on both axes, keeps full-table `aria-rowindex` and `aria-colindex` values, and keeps a focused cell's row and column mounted while either scrolls away. Before, a list with both capabilities windowed the rows and rendered every column. Tables that do not opt in are unchanged.

@humbertovirtudes
