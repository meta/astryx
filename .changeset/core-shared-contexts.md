---
'@astryxdesign/core': patch
---

[fix] A component you swizzled now shares Core's React contexts with the package components around it. Before, the copy created a second instance of every context it uses, so a copied `Button` inside a package `InputGroup`, a copied consumer of `useToast` under the package `LayerProvider`, or package group state around a copied overlay did not see each other. Every Core context is now registered under a versioned key, so a copy and the package of the same version use one context, and a layer boundary resets a copy's layer-scoped context as it resets the package's. No API changes.

@cixzhang
