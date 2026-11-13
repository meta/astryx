---
'@astryxdesign/core': patch
---

[fix] DropdownMenu syncs the refs its show and hide call at commit. After a render React discards, as a suspended transition does, its entrance under a finger holds input as the committed menu says.

@vjeux
