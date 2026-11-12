---
'@astryxdesign/core': patch
---

[fix] Selector's presentation syncs its show, hide and popover-content refs at commit. After a render React discards, as a suspended transition does, opening the popover runs the committed show.

@vjeux
