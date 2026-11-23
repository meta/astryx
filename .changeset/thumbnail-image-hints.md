---
'@astryxdesign/core': patch
---

[fix] Thumbnail now forwards native image loading hints (`loading`, `decoding`, `fetchPriority`) and intrinsic `width`/`height` to its inner image. Before, these props were treated as wrapper attributes, so thumbnail lists could not opt into lazy loading or provide image dimensions for layout stability.

@bezabyte
