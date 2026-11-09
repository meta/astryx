---
'@astryxdesign/core': patch
---

[fix] Gestures: a finger's lift is read on the clock its moves came on. In WebKit on Linux, a page pointerup listener that runs long no longer makes a fast flick read as a resting finger, or a tap lifted in time read as a long press.

@vjeux
