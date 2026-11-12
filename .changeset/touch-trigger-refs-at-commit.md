---
'@astryxdesign/core': patch
---

[fix] Tooltip's and HoverCard's touch trigger, and Tooltip's handlers with the controlled and enabled flags they carry, sync at commit. After a render React discards, as a suspended transition does, a tap answers with the committed props, and a press outside still closes a shown tooltip.

@vjeux
