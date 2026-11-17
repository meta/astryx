---
'@astryxdesign/core': patch
---

[feat] `createReorderable` takes a `handle` option for each item's reorder handle: `placement`, `'end'` (the default) or `'start'`, and `visibility`, `'always'` or `'hover'`. Without the option, every handle stays where it is today. A handle that always shows takes its own place in its row; at the start, a row that stays put keeps that place, so the labels line up. A handle that shows on hover shows while its row is hovered or holds the focus, and hangs outside the row's content, taking that room from the container's padding; under a coarse pointer, under `edge` `'outset'` or `'bleed'`, and after a list marker at the start, it sits in its row. Without `visibility`, List and TransferList use `'always'`, and ListInput uses `'hover'`. The handle's placement, reveal and room ship with the reorderable object, so a List without `reorderable` loads none of them.

@ernestt
