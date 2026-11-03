---
'@astryxdesign/core': patch
---

[fix] A removable `Token` that its width cuts off now keeps its 16 by 16 remove button. The button used to shrink to 12 px wide, so its focus ring drew as an oval and its press target narrowed to 20 by 24 px. Only the label is cut now. (#9599)
@HelloOjasMutreja
