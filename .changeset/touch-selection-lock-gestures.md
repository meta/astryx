---
'@astryxdesign/core': patch
---

[chore] Internal: the gesture host applies a recognizer's own `selectionLock` to that recognizer's contact and imports no lock itself, and where the primary pointer is fine the press controller registers no touch listener. Not exported from the package entry point.

@vjeux
