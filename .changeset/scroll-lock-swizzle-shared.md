---
'@astryxdesign/core': patch
---

[fix] A swizzled overlay and the package's overlays now share one page scroll lock: closing one keeps the page locked while the other is still open, and the page's own overflow comes back after the last one closes. Before, each copy kept its own count and saved styles, so closing a package Dialog over an open swizzled Drawer (or the reverse) let the page scroll behind the open overlay. Text-selection locks and page touch holds are shared the same way. No API changes.

@cixzhang
