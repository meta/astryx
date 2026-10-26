---
'@astryxdesign/core': patch
---

[chore] Internal: the rect morph, one way for a touch presentation to grow out of a source rect and shrink back into it. `lerpPath` (a straight line between two rects) and `edgeGrowPath` (UIKit's popover, growing out of a point on its edge) name the rect an element shows at each progress; `morphCurves` turns a path into compositor curves (`translate`, `scale` and a companion `opacity`); `createRectMorph` presents an element along a path and dismisses it back on a copy or on itself, each continuing the other from the rect on screen with its velocity, with Reduced Motion left to the animator. It runs on new progress helpers (`progressCurve`, `mapProgress`, `mapRange`, `presentedProgressVelocity`). Not exported from the package entry point; no component uses it yet.

@vjeux
