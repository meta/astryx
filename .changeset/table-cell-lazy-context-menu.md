---
'@astryxdesign/core': patch
---

[perf] TableCell and TableHeaderCell load their right-click context menu only when the cell has `contextMenuActions`. A table without context menus no longer ships ContextMenu, DropdownMenu's menu hooks and the touch sheet: importing `TableCell` drops from about 89 KB to about 9 KB gzip. A cell with actions renders its content at once, and its menu attaches as soon as the menu code loads; the content keeps its DOM node, focus and state when it does. Until then, right-click shows the browser's menu, so a test that opens a cell's menu right after render now has to wait for the menu to load. `resolveContextActions` keeps its export and no longer pulls the menu in.

@rhagigi
