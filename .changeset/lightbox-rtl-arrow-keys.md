---
'@astryxdesign/core': patch
---

[fix] Lightbox's Left and Right arrow keys now follow the writing direction. In a right-to-left page the gallery's Next button sits on the left, and ArrowLeft now moves to the next item and ArrowRight to the previous one, matching the buttons. Before, ArrowLeft always went to the previous item, so in RTL the keys moved against their buttons. Panning a zoomed image with the arrow keys is unchanged in both directions: the image is not mirrored, so ArrowRight still reveals what is to its right.

@vjeux
