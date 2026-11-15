---
'@astryxdesign/core': patch
---

[fix] ContextMenu: in a bottom sheet, a data sub-menu whose label is not a plain string (for example emphasized text) now names the sheet after that label while its level shows, so a screen reader announces the level, as DropdownMenu does. Back returns the root name.

@cixzhang
