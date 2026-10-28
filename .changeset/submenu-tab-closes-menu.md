---
'@astryxdesign/core': patch
---

[fix] `DropdownMenu` and `ContextMenu`: Tab or Shift+Tab on a row inside an open sub-menu flyout now closes every open level and the menu, calls `onOpenChange(false)` once, and lets focus move on from the trigger, as Tab already did from a top-level row (WAI-ARIA Menu Button). Before, the menu stayed open. A sub-menu with a `header` or `footer` keeps its Tab cycle.

@cixzhang
