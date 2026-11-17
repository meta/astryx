---
'@astryxdesign/core': patch
---

[fix] List: a focused interactive row shows its whole focus ring. The list's inline clip (which keeps a swiped row inside the list) used to cut the ring's start and end sides. While a ring is drawn, the list's clip edge now moves out by the ring's width, which changes no layout: the list, its rows and any scrolling container keep their size and position. Lists that reach into their container's padding (`edge="outset"` and `edge="bleed"`) are unchanged.

@cixzhang
