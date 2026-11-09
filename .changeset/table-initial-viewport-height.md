---
'@astryxdesign/core': patch
---

[feat] `useTableRowsVirtualization`'s `viewportHeight` is renamed `initialViewportHeight` before the hook's first stable release, and it is optional. It sizes the Table's first frame, on the server and before the viewport is measured, and bounds the viewport; after mount the measured viewport sets the window. Without it, the viewport fills its block-sized parent and the first frame renders one row plus overscan. `rowHeight` is unchanged.

@cixzhang
@humbertovirtudes
