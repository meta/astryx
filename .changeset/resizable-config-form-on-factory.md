---
'@astryxdesign/core': patch
---

[chore] The configuration-object `useResizable` builds on `createResizable`, with no handle of its own, and `ResizeHandle`'s `resizable` path goes through the factory's input, so the region's state and the handle's input each have one implementation. No behavior changes.

@vjeux
