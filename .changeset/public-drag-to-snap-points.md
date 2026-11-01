---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[feat] `createDragToSnapPoints` and its hook `useDragToSnapPoints` let a drag move an element along one axis and settle it on snap points (px offsets from its resting position) at the release: the nearest one, the next one in its direction after a flick faster than `flickThreshold` (default 1008 px/s), or the one it started from when the release moves back. The settle continues the release velocity, `settleTo(index)` settles without a drag, and `onSettle(index)` reports where it landed. `createDragToSnapPoints` is exported from the package root and `useDragToSnapPoints` from `@astryxdesign/core/hooks`; the CLI's templates gain a playing-card example of each.

@vjeux
