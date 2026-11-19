---
'@astryxdesign/core': patch
---

[feat] A SideNavItem's built-in icon (an icon name or icon component given as `icon` or `selectedIcon`) carries its own theme target, `side-nav-item-icon`, with the row's `selected` and `disabled` states, in the expanded and the collapsed rail. A theme can color the side nav icons apart from their labels and from every other icon. A custom React node given as `icon` is left as it is. The default look does not change.

@josephfarina
