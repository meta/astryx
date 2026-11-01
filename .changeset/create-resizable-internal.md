---
'@astryxdesign/core': patch
---

[chore] The configuration-object `useResizable` and `ResizeHandle`'s `resizable` path go through one internal resize factory and one input module, through the same size model as before, so the region's state and the handle's input each have one implementation. No behavior changes.

@vjeux
