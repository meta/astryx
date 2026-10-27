---
'@astryxdesign/core': patch
---

[chore] Internal: one opt-in lift-from-trigger presentation for touch surfaces. The trigger itself lifts into the top layer above a tinted backdrop; a surface grows out of the press beside it on the shared rect morph and shrinks back into it on the layer runtime's exit copy; the trigger returns to its place. Translate, scale and opacity only; nothing mounted at rest, four elements while lifted. A zoom from a thumbnail lifts a copy of the thumbnail's picture into the viewer instead, while the thumbnail hides in place. Not exported from the package entry point; no component uses it yet.

@vjeux
