---
'@astryxdesign/core': patch
---

[fix] DropdownMenu, ContextMenu, Selector, TabList, TopNav, SideNav, Breadcrumbs: when a finger picks a menu row, the click guard cancels only that finger's `touchend`, so a `touchend` from another finger is never cancelled. The menu reads the finger's identifier from the `touchstart` that follows its `pointerdown`. A `touchend` without `changedTouches` still counts as the picking finger's.

@cixzhang @vjeux
