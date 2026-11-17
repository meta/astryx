---
'@astryxdesign/core': patch
---

[fix] A mouse or trackpad pick on a TopNavMenu item, a TopNavMegaMenu item or the featured card's link now closes the menu and returns focus to its trigger too, as a keyboard, finger or pen pick does and as DropdownMenu does for every pointer. To keep a menu open after a pick, set the item's `hasCloseOnSelect` to `false`.

@josephfarina
