---
'@astryxdesign/core': patch
---

[chore] Internal: gesture recognizer and arena fixes from review; the early claim is opt-in, and a numeric `claimDistance` applies to any direction; one velocity tracker for every gesture (`spec:AST-100`: UIKit's measured blend, a scrolling surface's release through the pan's `scrollVelocity()`, and FR2's release rules). Not exported from the package entry point; no component uses it yet.

@vjeux
