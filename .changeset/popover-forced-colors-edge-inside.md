---
'@astryxdesign/core': patch
---

[fix] DropdownMenu: with forced colors on, a capped menu's popover surface draws its 1 px edge inside its box, so it keeps its full 16 px gap from the screen edge instead of 14 px. Popover, ContextMenu and sub-menu flyout surfaces draw the edge the same way and keep their size, and a focused Popover surface still shows its focus ring.

@cixzhang
