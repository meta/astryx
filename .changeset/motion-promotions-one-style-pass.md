---
'@astryxdesign/core': patch
---

[perf] Motion: the motions that one callback starts on elements that came in the same task read their stylesheets' `will-change` in one style pass, after the callback. Before, each element forced a style pass of its own: eight for a list whose eight rows glide together.

@vjeux
