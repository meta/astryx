---
'@astryxdesign/core': patch
---

[chore] Internal: one opt-in lift-from-trigger presentation for touch surfaces. The trigger itself lifts into the top layer above a tinted backdrop; a surface grows out of the press beside it on the shared rect morph and shrinks back into it on the layer runtime's exit copy; the trigger returns to its place. Translate, scale and opacity only; nothing mounted at rest, four elements while lifted. Not exported from the package entry point; ContextMenu's touch lift uses it.

@vjeux
