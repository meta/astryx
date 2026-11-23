---
'@astryxdesign/core': patch
---

[fix] Popover, DropdownMenu, ContextMenu: with forced colors on, a floating surface draws its 1 px edge just inside its box instead of outside it, so a menu capped to the viewport keeps its full 16 px gap from the screen edge instead of 14 px. The edge looks the same.

@cixzhang
