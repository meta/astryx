---
'@astryxdesign/core': patch
---

[fix] DropdownMenu: an open sub-menu in a bottom sheet shows the current `items` after a re-render, so a row's new label or check appears at once. It kept the rows from when the sub-menu opened until a person left and entered it again. If the sub-menu's own row leaves `items`, the sheet shows the deepest level that still exists.

@cixzhang
