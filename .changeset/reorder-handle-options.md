---
'@astryxdesign/core': patch
---

[feat] `createReorderable` takes a `handle` option for each item's reorder handle: `placement`, `'end'` (the default, where the handle sits today) or `'start'`, and `revealBehavior`, `'always'` or `'adaptive'`. A handle that always shows takes its own place in its row; at the start, a row that stays put keeps that room. With `'adaptive'`, where the primary pointer is fine, the handle shows on hover or focus and hangs outside the row's content and takes that room from the container's padding; under a coarse pointer it always shows. ListInput keeps a handle at the end in its Remove cell, as today. Without `revealBehavior`, List and TransferList use `'always'`, and ListInput uses `'adaptive'`. A List without `reorderable` loads none of the handle's styles. In a disabled row the handle dims with the row, once, to half opacity: inside the row's end slot as before, and now also where it sits outside it (a List row without end content, ListInput), where it showed at full opacity.

@ernestt @cixzhang
