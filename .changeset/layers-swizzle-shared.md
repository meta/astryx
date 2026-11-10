---
'@astryxdesign/core': patch
---

[fix] A swizzled overlay and the package's overlays now share one layer runtime: one layer stack (Escape and dismissal reach the top layer in either copy), one modal outlet order, one gesture counter, and one record of outside dismissals, popover show and hide operations, layer surfaces and press claims per page. Before, each copy kept its own, so a copied Popover over a package Dialog (or the reverse) could close the wrong layer, race the other's popover operations, or miss its outside press. No API changes.

@cixzhang
