---
'@astryxdesign/core': patch
---

[fix] Table: a pinned column (`useTableStickyColumns`) now draws its own row dividers, so the line under it no longer goes missing while the table scrolls horizontally. A theme's border color and an app's own borders on a row or cell carry onto the pinned cells, and an open detail panel (`useTableRowExpansion`) carries its row's divider the same way.

@cixzhang
