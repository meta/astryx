---
'@astryxdesign/core': patch
---

[fix] A Dialog or other layer opened inside the open `MobileNav` drawer scrolls with a finger again. The drawer blocks background pans on its scrim and header instead of on the whole dialog, so a nested layer keeps its own touch scrolling. Pinch-zoom still works over the nav.

@cixzhang
