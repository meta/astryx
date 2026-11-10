---
'@astryxdesign/core': patch
---

[fix] A swizzled `LayerProvider` now shows the package's toasts: the viewport the package's `Toast` registers renders in a copied provider's outlet, and the package's provider renders a copy's. Before, each copy kept its own registry, so toasts added under a swizzled provider never showed. The registry lives under a registered, versioned key. No API changes.

@cixzhang
