---
'@astryxdesign/core': patch
---

[chore] Internal: the rect morph's paths, the geometry touch presentations share when they grow out of a source rect and shrink back into it. `lerpPath` (a straight line between two rects) and `edgeGrowPath` (UIKit's popover, growing out of a point on its edge) name the rect an element shows at each progress, and say how an interrupted motion continues in their own law; `morphCurves` turns a path into compositor curves (`translate`, `scale` and a companion `opacity`). Not exported from the package entry point; no component uses them yet.

@vjeux
