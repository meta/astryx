---
'@astryxdesign/core': patch
---

[fix] Slider syncs its values, change-end callback and touch update refs at commit. After a render React discards, as a suspended transition does, a drag's end reports the committed value to the committed callback.

@vjeux
