---
'@astryxdesign/core': patch
---

[chore] Internal: the rect morph, one way for a touch presentation to grow out of a source rect and shrink back into it. `createRectMorph` presents an element along a path (`lerpPath`, `edgeGrowPath`) and dismisses it back on a copy or on itself, each continuing the other from the rect on screen. A motion a tap or a key starts plays a theme duration and easing; a gesture's release plays a spring from its velocity. Reduced Motion is left to the animator. `timedProgressCurve` joins the progress helpers. Not exported from the package entry point; no component uses it yet.

@vjeux
