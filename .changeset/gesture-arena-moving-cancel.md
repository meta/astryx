---
'@astryxdesign/core': patch
---

[chore] Internal: a claimed gesture cancelled while one of its fingers is moving keeps that moving finger claimed until it lifts, so the page never takes the drag over midway; a resting finger is still given back when its gesture is cancelled. Not exported from the package entry point.

@vjeux
