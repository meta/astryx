---
'@astryxdesign/core': patch
---

[fix] The menu press model behind DropdownMenu, ContextMenu and their submenus syncs its option, step and trigger-context refs at commit. A press after a render React discards, as a suspended transition does, now uses the committed options.

@vjeux
