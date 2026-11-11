---
'@astryxdesign/core': patch
---

[fix] DropdownMenu, ContextMenu, Selector, TabList, TopNav, SideNav, Breadcrumbs: when a finger picks a menu row, the menu now cancels only that finger's `touchend`. Before, it cancelled the next `touchend` from any finger. If another finger's `touchend` came first, that finger lost its tap, and the picking finger's own `touchend` then made a click. The menu reads the finger's identifier from the `touchstart` that follows its `pointerdown`. A `touchend` that names no touches still counts as the picking finger's.
@vjeux
