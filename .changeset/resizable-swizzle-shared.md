---
'@astryxdesign/core': patch
---

[fix] A swizzled ResizeHandle or LayoutPanel now finds the package's panel or handle beside it, and the reverse. When the region collapses, focus inside the panel moves to the handle and the panel goes inert. Before, each copy kept its own records of lent panels and handles, so the panel resized, but focus could drop to the page as it collapsed. No API changes.

@cixzhang
