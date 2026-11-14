---
'@astryxdesign/core': patch
---

[fix] An open Lightbox caption that widens to fewer lines no longer forces a layout in the frame that shrinks it. That holds for a caption of text, inline elements, inline-blocks, images, and paragraphs or other plain blocks with no room under its last line. Anything else takes the exact read, as before: one forced layout. That includes floats, drop caps, flex, grid and clipped blocks, and empty inline-blocks. It includes room under the last line of text, such as bottom padding or a trailing line break. It also includes list markers, text indents, justified last lines, and `::before` or `::after` content outside an inline element's boxes.

@vjeux
