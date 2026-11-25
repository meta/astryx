---
'@astryxdesign/core': patch
---

[fix] Popover, Tooltip and menus: when the trigger or anchor element is replaced while the layer is open, the layer watches the new element's place in view. Before, it kept watching the element that left the page, so the layer read its anchor as out of view.

@nynexman4464
