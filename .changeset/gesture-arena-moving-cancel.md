---
'@astryxdesign/core': patch
---

[chore] Internal: a gesture that cancels itself on a finger's move (a long press dragged past its tolerance) keeps that finger claimed until it lifts, so the page never takes the drag over midway; a resting finger is still given back when its gesture is cancelled. Not exported from the package entry point.

@vjeux
