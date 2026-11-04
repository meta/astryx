---
'@astryxdesign/core': patch
---

[fix] `Icon`'s `ref` now reaches the rendered `<svg>` for a semantic or namespaced name, as its type promises. Before, it reached the `<svg>` only when `icon` was a component; for a name, the ref stayed empty. For a name whose glyph has no `<svg>`, the ref is `null`.

@cixzhang
