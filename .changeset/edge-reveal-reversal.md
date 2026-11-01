---
'@astryxdesign/core': patch
---

[fix] With an `animatedLayout` handle, a Collapsible or a TreeList row closed while it opens, or opened again while it closes, continues from what it shows: the content's edge stays on the content after it on every frame, instead of jumping back to fully shown or hidden. Under Reduce Motion with a touch pointer, where the content cross-fades instead, a reversal still starts its fade over.

@vjeux
