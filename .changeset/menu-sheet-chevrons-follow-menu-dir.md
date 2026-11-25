---
'@astryxdesign/core': patch
---

[fix] DropdownMenu, ContextMenu: in the touch sheet, a sub-menu row's chevron and the Back chevron now flip by the menu's own direction (its nearest `dir`), as the popover's already do. In a left-to-right menu inside a right-to-left page, the row chevron used to point left and the Back chevron right, against the sheet's own layout.

@cixzhang
