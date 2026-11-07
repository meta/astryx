---
'@astryxdesign/core': patch
---

[fix] `SideNavItem` rows grow with a larger text size. An expanded row's size now sets a minimum height instead of a fixed one, so above 200% text a row's label no longer overlaps the next row, and its end content (such as a count `Badge`) stays inside the row. Collapsed rail rows and the default text size are unchanged.

@cixzhang
