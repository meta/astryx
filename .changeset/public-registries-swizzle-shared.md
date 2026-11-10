---
'@astryxdesign/core': patch
---

[fix] Icons registered with `registerIcons()` and themes registered by name now reach swizzled components on the same React. Before, a swizzled copy kept its own icon and theme registries, so a copied `Icon` fell back to the default for a product's registered icon, and a copied component could not find a theme by name. The registries are one per React, so a second React on the page never renders the first one's icon elements. No API changes.

@cixzhang
