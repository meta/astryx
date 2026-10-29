---
'@astryxdesign/core': patch
---

[fix] Where the primary pointer is fine (a mouse, a trackpad, a touchscreen laptop, a desktop pen tablet), the press feedback controller no longer registers a touch listener: it reads the primary pointer at the first finger or pen press and keeps its `touchcancel` listener only while that pointer is coarse.

@vjeux
