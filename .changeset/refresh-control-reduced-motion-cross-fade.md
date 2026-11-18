---
'@astryxdesign/core': patch
---

[fix] With Reduce Motion on a phone, Lab's RefreshControl keeps its list in view when a pull is released or a refresh ends. It cross-fades to its new place instead of blanking between the two. The cross-fade comes from a new export of `internal/touch`; apps import nothing new.

@vjeux
