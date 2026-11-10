---
'@astryxdesign/core': patch
---

[chore] Internal: the rect morph, one way for a touch presentation to grow out of a source rect and shrink back into it. `createRectMorph` presents an element along a path (`lerpPath`, `edgeGrowPath`) and dismisses it back on a copy or on itself, each continuing the other from the rect on screen. Each play takes the timing the component's motion record names (AST-094 FR45): a duration and easing, or a spring, starting from the velocity it is given. Reduced Motion is left to the animator. `easedProgress` moves to the progress helpers and keeps a retargeted velocity; `timedCurve` joins them. Not exported from the package entry point; no component uses it yet.

@vjeux
