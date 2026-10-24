---
'@astryxdesign/core': patch
---

[chore] Internal: useAnimator, a React wrapper around the touch presentations' animator that never re-renders per frame, and browser proofs on the interaction harness that the animator's motion keeps running through a blocked main thread in Chromium and WebKit. Not exported from the package entry point.

@vjeux
