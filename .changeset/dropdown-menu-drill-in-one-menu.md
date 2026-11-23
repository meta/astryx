---
'@astryxdesign/core': patch
---

[fix] DropdownMenu, ContextMenu: a drilled-in sub-menu (on a phone, or with `presentation="drill-in"`) is the only menu in the accessibility tree. The root menu no longer wraps it as a second menu while the sub-menu's rows show, and Back restores the root menu.

@cixzhang
