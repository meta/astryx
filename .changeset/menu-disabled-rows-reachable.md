---
'@astryxdesign/core': patch
---

[fix] Menus: the arrow keys, Home, End and type-ahead now reach a disabled row in `DropdownMenu`, its sub-menus, `MoreMenu`, `ContextMenu` and `NavHeadingMenu`, so a keyboard or screen-reader user finds the row and its description. The row takes focus, is announced as disabled, and Enter, Space or a click on it still does nothing and leaves the menu open. Opening a menu from the keyboard still lands on an enabled row.

@cixzhang
