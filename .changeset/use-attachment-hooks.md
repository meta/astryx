---
'@astryxdesign/core': patch
---

[chore] Internal: the gesture hooks' attach-and-release lifecycle, `useAttachment`, moves to `hooks/` (not exported), where other hooks can use it, and `useFingerScroll` keeps its finger-scroll watch through it instead of its own copy of that lifecycle. The gesture-sync helpers stay in `gestures/gestureSync.ts`. No behavior changes.

@vjeux
