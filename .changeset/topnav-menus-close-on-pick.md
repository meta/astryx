---
'@astryxdesign/core': patch
---

[fix] TopNavMenu and TopNavMegaMenu close when you pick an item, as DropdownMenu does, and return focus to their trigger. Before, the menu or panel stayed open with focus inside it. In a mega menu, following the featured card's link closes the panel too. To keep a menu open after a pick, set the item's `hasCloseOnSelect` to `false`.

@josephfarina
