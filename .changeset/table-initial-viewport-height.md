---
'@astryxdesign/core': patch
---

[feat] `useTableRowsVirtualization`'s `viewportHeight` is renamed `initialViewportHeight` before the hook's first stable release, and it is optional. It only sizes the first window, on the server and before the viewport is measured; it no longer sets the Table's height. A windowed Table scrolls inside the height its parent gives it, so give the parent a height. Without one, the scroll area is as tall as all its rows, every row renders, and a development warning says how to size the parent. Without `initialViewportHeight`, the first frame renders one row plus overscan. `rowHeight` is unchanged.

@cixzhang
@humbertovirtudes
