---
'@astryxdesign/core': patch
---

[experimental] Two experimental subpaths for building touch presentations, outside the stable compatibility promise (they may change or be removed in a patch release). `@astryxdesign/core/motion/experimental` exports the compositor animator (`createAnimator`, `useAnimator`), UIKit's spring, rubber-band and cubic-bézier math, `resolveMotion` (a motion role's value under the element's theme), and the UIKit constants table as the read-only `uikit` namespace. `@astryxdesign/core/gestures/experimental` exports UIKit-style gesture recognizers (tap, long press, pan, screen-edge pan, swipe, pinch, rotation, hover), `useGestureRecognizer`, `usePressTracker`, `useTouchPresentation`, `readTouchPresentation` and `playHaptic`. Nothing is added to the package root or to any other subpath.

@vjeux
