---
'@astryxdesign/core': patch
---

[fix] Tooltip's and HoverCard's touch trigger syncs its callback refs at commit. A tap after a render React discards, as a suspended transition does, now answers with the committed props.

@vjeux
