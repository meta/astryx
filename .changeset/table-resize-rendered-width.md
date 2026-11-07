---
'@astryxdesign/core': patch
---

[fix] A Table column-resize handle now announces its column's rendered width from the first render after layout. Before, until a column was first resized, its handle announced the column's minimum width, so a screen reader read the wrong width.

@cixzhang
