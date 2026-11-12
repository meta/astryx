---
'@astryxdesign/core': patch
---

[fix] ResizeHandle reads its region, direction and disabled state as committed. A render React discards, as a suspended transition does, no longer makes a key press resize another region or refuse an enabled handle.

@vjeux
