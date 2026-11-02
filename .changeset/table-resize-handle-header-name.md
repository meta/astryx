---
'@astryxdesign/core': patch
---

[fix] In a `Table` with resizable columns, a column header is now named by its text alone. Before, the resize handle's width value joined the header's name, so screen readers read "Name 60" with every cell in the column.

@duytbp
