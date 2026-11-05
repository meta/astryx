---
'@astryxdesign/core': patch
---

[fix] The open `MobileNav` drawer blocks background pans on the scrim beside it instead of on the whole drawer, so no drawer element restricts `touch-action` for a Dialog or other layer rendered inside it. Pinch-zoom still works over the nav.

@cixzhang
