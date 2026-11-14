---
'@astryxdesign/core': patch
---

[fix] An open Lightbox caption that widens to fewer lines no longer forces a layout in the frame that shrinks it, unless the block holding its last line, one of its ancestors or a block after its text has its own `::before` or `::after` content.

@vjeux
