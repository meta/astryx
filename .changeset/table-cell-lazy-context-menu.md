---
'@astryxdesign/core': patch
---

[perf] TableCell and TableHeaderCell load their right-click context menu only when the cell has `contextMenuActions`. A table without context menus no longer ships ContextMenu, DropdownMenu's menu code and the touch sheet: `import {Table} from '@astryxdesign/core/Table'` drops from about 358 KB to about 138 KB minified (124 KB to 48 KB gzip). A cell with actions renders its content at once and starts loading its menu on its first client render; the content keeps its DOM node, focus and state when the menu attaches. A right-click, Shift+F10 or long press that arrives before then is held and opens the cell's menu when it loads, unless another press or key comes first, so the browser's own menu does not appear. If the menu code fails to load, the table stays and the browser's own menu returns; a later mount, or a later right-click or touch on that cell, asks the module loader again. A test that expects the menu synchronously right after render has to wait for it to load. `resolveContextActions` keeps its export and no longer pulls the menu in.

@rhagigi @cixzhang
