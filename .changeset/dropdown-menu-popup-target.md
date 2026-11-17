---
'@astryxdesign/core': patch
---

[feat] DropdownMenu: the floating box of a DropdownMenu (its popover) and of each sub-menu flyout carries a new `dropdown-menu-popup` theme target, so a theme can give these menus their own border, corners and shadow without restyling every popover. `dropdown-menu` stays on the list inside the DropdownMenu's box. Under a ContextMenu, sub-menu flyouts carry the new target too, while the context menu's own box keeps only `context-menu`.

@josephfarina
