---
'@astryxdesign/core': patch
---

[fix] Dismissing a file picker (Escape, or Cancel in the chooser) inside a `Drawer`, `MobileNav` or `Lightbox` no longer closes it and loses what was in it. Only a close request fired at the surface itself closes it, as `Dialog` and `BottomSheet` already do.

@cixzhang
