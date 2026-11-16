---
'@astryxdesign/core': patch
---

[feat] `createReorderable` takes a `handle` option for each item's reorder handle: `placement`, `'end'` (the default, where the handle sits today) or `'start'`, and `visibility`, `'always'` or `'hover'`. A handle that always shows takes its own place in its row, and a row that stays put keeps that room. One that shows on hover or focus, where the primary pointer is fine, hangs outside the row's content and takes that room from the container's padding; under a coarse pointer it always shows. Without `visibility`, List and TransferList use `'always'`, and ListInput uses `'hover'`. A List without `reorderable` loads none of the handle's styles.

@ernestt @cixzhang
