---
'@astryxdesign/core': patch
---

[fix] A touch on a toast is now decided by its first move. A first move toward the toast's edge belongs to the swipe and never scrolls the page; any other first move leaves the page its scroll. The shared gesture host makes that claim, so importing Toast now brings in the host: about 24 KB gzip on its own (Toast from about 74 KB to 99 KB), and nothing more on a page whose other touch components already load it. LayerProvider without a Toast import is unchanged.

@vjeux
