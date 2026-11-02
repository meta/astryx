---
'@astryxdesign/core': patch
---

[fix] `useScrollOverflow` measures again when the container's content changes with the container keeping its size: a child added, removed or resized, or a new gap or padding. Carousel's scroll area, a tab stop only while its content overflows, and its edge buttons and fades follow slides added or removed and a slide that grows; TabList's fades follow its tabs the same way.

@vjeux
