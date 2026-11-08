---
'@astryxdesign/core': patch
---

[fix] Layer: a light-dismissible layer that opens from a right click's `contextmenu` event stays open when that same press is released. Before, the release counted as a press outside, so a DropdownMenu opened through `isMenuOpen` from a right click closed at once. A later press outside still dismisses the layer.

@cixzhang
