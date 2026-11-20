---
'@astryxdesign/core': patch
---

[fix] A TreeList row with no action (no onClick, href or children) now shows the focus ring when it has keyboard focus. Such a row was already a stop in the tree's arrow-key focus, but it showed no sign of focus.

@josephfarina
