---
'@astryxdesign/core': patch
---

[fix] A swizzled ResizeHandle or LayoutPanel now works with the package's resizable parts: a copy reads a controller the package's `createResizable` made, finds a package panel lent beside its handle, and hears the package's pane changes, and the reverse. Before, each copy kept its own records, so a copied handle beside a package panel (or the reverse) resized nothing. No API changes.

@cixzhang
