---
'@astryxdesign/core': patch
---

[chore] Internal: gesture recognizer and arena fixes from review; the early claim is opt-in, and a numeric `claimDistance` applies to any direction; one release filter for every gesture (`spec:AST-100`: UIKit's measured blend per recognizer kind, with FR2's 40 ms stillness reset), read by the pan and by the new `ScrollViewPanGestureRecognizer`. Not exported from the package entry point; no component uses it yet.

@vjeux
