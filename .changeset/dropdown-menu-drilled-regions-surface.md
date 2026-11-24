---
'@astryxdesign/core': patch
---

[fix] DropdownMenu: a drilled-in sub-menu with a header or footer keeps the menu's themed surface. A theme that styles the `dropdown-menu` target now paints that view as it paints the root menu, instead of letting the plain popover show through.

@cixzhang
