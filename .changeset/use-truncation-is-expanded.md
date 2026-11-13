---
'@astryxdesign/core': patch
---

[feat] `useTruncation` takes `isExpanded`: pass true while the text is shown in full; the hook keeps reporting whether it is cut off when clamped. A Lightbox caption uses it, so its "less" stays while the caption is open.

@vjeux
