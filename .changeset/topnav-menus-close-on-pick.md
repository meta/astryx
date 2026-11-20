---
'@astryxdesign/core': patch
---

[fix] TopNavMenu and TopNavMegaMenu close when you pick an item with the keyboard, a finger or a pen, and return focus to their trigger. Before, the menu or panel stayed open with focus inside it. In a mega menu, following the featured card's link this way closes the panel too. A mouse or trackpad pick leaves the menu open, as before. To keep a menu open after a pick, set the item's `hasCloseOnSelect` to `false`.

@josephfarina
