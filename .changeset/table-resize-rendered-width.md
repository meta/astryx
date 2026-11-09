---
'@astryxdesign/core': patch
---

[fix] A Table column-resize handle now announces its column's rendered width from the first render after layout, and its announced range always holds that width, also when the layout renders a column past its maximum or minimum width. Before, until a column was first resized, its handle announced the column's minimum width, so a screen reader read the wrong width.

@cixzhang
