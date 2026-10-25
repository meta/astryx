---
'@astryxdesign/core': patch
---

[chore] UseAnimator, a React wrapper around the touch presentations' animator that never re-renders per frame, and browser proofs on the interaction harness that the animator's motion keeps running through a blocked main thread in Chromium and WebKit. Not exported from the package root; touch presentations reach it through the experimental subpaths (see their entry).

@vjeux
