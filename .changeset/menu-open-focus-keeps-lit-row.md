---
'@astryxdesign/core': patch
---

[fix] DropdownMenu: a held mouse dragged from the trigger onto a row keeps that row lit. On a loaded page the menu's open focus could land after the drag reached the row and take the highlight back to the menu container until the pointer moved again.

@vjeux
