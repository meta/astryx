---
'@astryxdesign/core': patch
---

[feat] `useTableRowsVirtualization`'s `viewportHeight` is renamed `initialViewportHeight` before the hook's first stable release. It only sizes the first window, on the server and before the viewport is measured; it no longer sets the Table's height. A windowed Table scrolls inside the height its parent gives it, so give the parent a height. `rowHeight` is unchanged.

@cixzhang
@humbertovirtudes
