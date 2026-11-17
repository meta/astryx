---
'@astryxdesign/core': patch
---

[feat] `createReorderable` takes a `handle` option for each item's reorder handle: `placement`, `'end'` (the default) or `'start'`, and `revealBehavior`, `'always'` or `'adaptive'`. Without the option, every handle stays where it is today. A handle that always shows takes its own place in its row; at the start, a row that stays put keeps that place, so the labels line up. An adaptive handle shows while its row is hovered or holds the focus where the primary pointer is fine, and hangs outside the row's content, taking that room from the container's padding (outside a container that publishes its padding, the rows move in instead); under a coarse pointer, under `edge` `'outset'` or `'bleed'`, and after a list marker at the start, it sits in its row. Without `revealBehavior`, List and TransferList use `'always'`, and ListInput uses `'adaptive'`. The handle's placement, reveal and room ship with the reorderable object, so a List without `reorderable` loads none of them. A disabled row's handle dims with the row once, to half opacity, also where it sits outside the row's end slot: a List row without end content, and ListInput.

@ernestt
