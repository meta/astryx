---
'@astryxdesign/core': patch
---

[fix] The open `MobileNav` drawer blocks background pans on its scrim and header instead of on the whole drawer, so a Dialog or other layer opened inside it keeps its own touch scrolling in a browser that resolves `touch-action` through DOM ancestors. Pinch-zoom still works over the nav.

@cixzhang
