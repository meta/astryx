---
'@astryxdesign/core': patch
---

[chore] Internal: gesture recognizer and arena fixes from review; a pan claims nothing before it begins at 10 pt; one velocity tracker for every gesture (`spec:AST-100`: UIKit's measured blend, a scrolling surface's release through the pan's `scrollVelocity()`, and FR2's release rules). Not exported from the package entry point.

@vjeux
