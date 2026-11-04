---
'@astryxdesign/core': patch
---

[fix] A touch on a toast is now decided by its first move. A first move toward the toast's edge belongs to the swipe and never scrolls the page; any other first move leaves the page its scroll. The shared gesture host makes that claim, so importing Toast or LayerProvider now brings in the host: about 24 KB gzip on its own (Toast 64.8 KB to 88.6 KB; Layer 100.7 KB to 124.2 KB), and nothing more on a page whose other touch components already load it.

@vjeux
