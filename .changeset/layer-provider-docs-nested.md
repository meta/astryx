---
'@astryxdesign/core': patch
---

[docs] `LayerProvider`: editors and generated docs show its description and example again; they were attached to an internal constant. The docs no longer say that a nested provider is ignored: a nested provider keeps the outer toast configuration and mounts no second toast viewport, and one that declares `inset` applies it to the layers in its subtree.

@cixzhang
