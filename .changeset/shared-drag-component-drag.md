---
'@astryxdesign/core': patch
---

[chore] Internal: a Core component's own drag runs on the shared drag path. `createPan` and `createSnapDrag` take a begin gate, a drag model and a custom property to draw into, beside the public `createPanGesture` and `createDragToSnapPoints`. The animator draws `x` into a registered custom property. Not exported from the package entry point.

@vjeux
