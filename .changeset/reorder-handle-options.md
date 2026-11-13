---
'@astryxdesign/core': patch
---

[feat] `createReorderable` takes a `handle` option for each item's reorder handle: `placement`, `'start'` (the default) or `'end'`, and `isAlwaysVisible`. A handle that always shows takes its own place in its row, and a row that stays put keeps that room; one that does not shows on hover or focus and hangs outside the row's content. Without `isAlwaysVisible`, List and TransferList always show their handles, and ListInput shows them on hover or focus.

@ernestt
