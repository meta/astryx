---
'@astryxdesign/core': patch
---

[fix] A swizzled overlay that carries its own copy of the layer runtime now shares the package's: one layer stack, one modal outlet order, one gesture counter, and one record of outside dismissals, popover show and hide operations, layer surfaces and press claims per page. Before, such a copy kept its own, so Escape over a swizzled HoverCard inside a package Dialog could close the Dialog too, and the two copies could race each other's popover operations or miss each other's outside presses. No API changes.

@cixzhang
