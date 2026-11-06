---
'@astryxdesign/core': patch
---

[fix] A block-edge reveal or conceal, as in Collapsible, TreeList and Table's row expansion with an `animatedLayout` handle, now slides the revealed element's children on the same frames as the content beside it, under a still clip on the element's box. An element that paints its own box keeps the moving clip. On iOS Safari a moving clip ran on its own clock and parted from that content for a few frames; now the two stay together. The glide's timing and curve are unchanged. Collapsible's region now wraps its children in one inner element; selectors like `region > *` or `:first-child` on the region's children need updating.

@vjeux
