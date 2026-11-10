---
'@astryxdesign/core': patch
---

[feat] Column windowing keeps focus and place: with `useTableColumnsVirtualization`, a focused cell whose column scrolls out of the window stays mounted with its original element until focus leaves the table, moves to another cell, or its column is removed, when focus returns to the Table's scroll area. Changing column order, widths, visibility or pinning keeps the first visible column and how far it is scrolled. Tables that do not opt in are unchanged.

@humbertovirtudes
