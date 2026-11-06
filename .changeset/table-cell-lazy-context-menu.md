---
'@astryxdesign/core': patch
---

[perf] TableCell and TableHeaderCell load their right-click context menu only when the cell has `contextMenuActions`. A table without context menus no longer ships ContextMenu, DropdownMenu's menu hooks and the touch sheet: importing `TableCell` drops from about 92 KB to about 10 KB gzip. A cell with actions renders its content at once, and its menu attaches as soon as the menu code loads; the content keeps its DOM node, focus and state when it does. A right-click, Shift+F10 or long press that arrives before then is held and opens the cell's menu when it loads, unless another press or key comes first, so the browser's own menu does not appear. A test that expects the menu synchronously right after render has to wait for it to load. `resolveContextActions` keeps its export and no longer pulls the menu in.

@rhagigi
