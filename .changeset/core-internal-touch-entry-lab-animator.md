---
'@astryxdesign/core': patch
---

[chore] Internal: Core's internal motion engine factory is renamed `createMotionEngine` (from `createMotionAnimator`), with its types `MotionEngine` and `MotionEngineOptions`, at its source and in every internal caller. Core's internal touch entry also re-exports, by name, the UIKit gesture values, the right-to-left check, and the touch-presentation hook and query that Lab components read. Lab's `useMotionEngine` hook wraps the engine, and Lab's refresh control uses it. Apps import nothing new.

@vjeux
