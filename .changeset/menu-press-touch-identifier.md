---
'@astryxdesign/core': patch
---

[fix] DropdownMenu, ContextMenu, Selector, TabList, TopNav, SideNav, Breadcrumbs: when a finger picks a menu row, the click guard cancels only that finger's `touchend` once the menu has named the touch, so another finger's `touchend` passes. The menu names the touch from the `touchstart` that follows its `pointerdown`. A `touchend` without `changedTouches`, or a lift whose touch the menu could not name, keeps the old rule: the next `touchend` is cancelled.

@cixzhang @vjeux
