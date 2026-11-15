---
'@astryxdesign/core': patch
---

[fix] List: a focused interactive row shows its whole focus ring. The list's inline clip (which keeps a swiped row inside the list) used to cut the ring's start and end sides. While a ring is drawn, the list now makes room for it, with no change to the rows' size or position; at rest the list keeps its size, so a scrolling container gains no horizontal scroll. Lists that reach into their container's padding (`edge="outset"` and `edge="bleed"`) are unchanged.

@cixzhang
