---
'@astryxdesign/core': patch
---

[chore] Internal: one opt-in lift-from-trigger presentation for touch surfaces. The trigger itself lifts into the top layer above a tinted backdrop; a surface fades in beside it on the shared rect morph; the trigger returns to its place. Translate, scale and opacity only; nothing mounted at rest, three elements while lifted, and no shadow. Not exported from the package entry point; no component uses it yet.

@vjeux
