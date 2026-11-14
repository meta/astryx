---
'@astryxdesign/core': patch
---

[fix] An open Lightbox caption that widens to fewer lines no longer forces a layout in the frame that shrinks it. That holds for a caption of text, inline elements, inline-blocks, images, and paragraphs or other plain blocks. Anything else takes the exact read, as before: one forced layout. That includes a float, a drop cap, a flex or grid block, a block that clips its overflow, a list marker, a text indent, a justified last line, and `::before` or `::after` content outside an inline element's boxes.

@vjeux
