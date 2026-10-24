---
'@astryxdesign/core': patch
---

[experimental] Gesture hooks follow their element: `useGestureRecognizer` and `usePressTracker` attach to a node rendered after mount or swapped behind the same ref, and call the consumer back neither from cleanup nor after unmount. `usePressTracker` takes `isBraking` (by default the host's) and applies a changed `trackingExpansion`, `highlightDelay`, `cancelTravel` or `quickTapFlash` from the next touch. The recognizer's arena plumbing (`arena`, `pending`, touch delivery, `applyState`, `resetToPossible` and the failure and simultaneity checks) is now `protected`. `attachTapHaptic` gives focus straight back from its hidden switch and adds none to a label that already labels another control.

@vjeux
