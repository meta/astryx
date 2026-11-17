---
'@astryxdesign/core': patch
---

[perf] A DropdownMenu built from `items` no longer loads the sub-menu's code until someone uses a sub-menu. A nested item's row shows at once; its flyout or drill-in view loads on the row's first hover, focus, press, or open key, and an open key or press made during the load still opens it. A menu with no nested items loads none of it. The compound `DropdownMenuSubMenu` is unchanged.

@cixzhang
