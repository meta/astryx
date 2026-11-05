---
'@astryxdesign/core': patch
---

[fix] Toast: without a LayerProvider, a toast dismissed before the fallback viewport mounts no longer shows, and its `onHide` runs once with `'manual'`.

@vjeux
