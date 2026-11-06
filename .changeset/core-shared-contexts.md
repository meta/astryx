---
'@astryxdesign/core': patch
---

[fix] Core registers every React context, and the English its components register, under a versioned key, so two copies of Core's modules on one page share them: a provider from one copy reaches consumers from the other, a layer boundary from either resets the layer-scoped contexts of both, and a component from either shows its English. A copy built against another version of a context keeps its own. No API changes.

@cixzhang
