---
'@astryxdesign/core': patch
---

[fix] Tooltip's and HoverCard's touch trigger, and Tooltip's handlers and the controlled state they read, sync at commit. After a render React discards, as a suspended transition does, a tap answers with the committed props, and a press outside still closes a shown tooltip.

@vjeux
