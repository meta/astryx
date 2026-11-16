---
'@astryxdesign/core': patch
---

[fix] TopNavMenu and TopNavMegaMenu close when you pick an item, as DropdownMenu does, and return focus to their trigger. Before, the menu or panel stayed open with focus inside it. In a mega menu, following the featured card's link closes the panel too. As with DropdownMenuItem, an item can set `hasCloseOnSelect` to false to keep the menu open for an action that reports its result on the item.

@josephfarina
