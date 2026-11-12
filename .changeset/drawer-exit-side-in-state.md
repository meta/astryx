---
'@astryxdesign/core': patch
---

[fix] Drawer keeps the side it exits to in state. A render React discards, as a suspended transition does, no longer changes the edge a closing drawer slides out to.

@vjeux
