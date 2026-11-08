---
'@astryxdesign/core': patch
---

[fix] Navigation rows grow with a larger text size. The shared nav item styles (`navItemStyles`, used by `SideNavItem` and by `TopNavItem` and the mega menu in the mobile drawer) now take their size as a minimum height instead of a fixed one, so above 200% text a row's label no longer overlaps the next row, and its end content (such as a count `Badge`) stays inside the row. Collapsed rail rows keep their fixed square. At the default text size, TopNav drawer menu and mega menu rows with a description now fit their text instead of overlapping the next row; other rows are unchanged. A caller `height` on these styles no longer brings a row below its size; override `minHeight` instead.

@cixzhang
