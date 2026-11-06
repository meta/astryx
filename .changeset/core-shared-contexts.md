---
'@astryxdesign/core': patch
---

[fix] Core registers every React context under a versioned key, so two copies of Core's modules on one page, such as a swizzled component and the package, share one context: a provider from one reaches consumers from the other, and a layer boundary from either resets the layer-scoped contexts of both. Copies of the same version share; a copy built against another version of a context keeps its own. No API changes.

@cixzhang
