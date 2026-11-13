---
'@astryxdesign/core': patch
---

[feat] `createReorderable` takes a `handle` option for each item's reorder handle: `placement`, `'start'` (the default) or `'end'`, and `visibility`, `'always'` or `'hover'`. A handle that always shows takes its own place in its row, and a row that stays put keeps that room; one that does not shows on hover or focus and hangs outside the row's content, taking that room from the container's padding. Without `visibility`, List and TransferList use `'always'`, and ListInput uses `'hover'`.

@ernestt
