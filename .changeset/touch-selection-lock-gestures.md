---
'@astryxdesign/core': patch
---

[chore] Internal: the gesture host applies a recognizer's own `selectionLock` to that recognizer's contact and imports no lock itself; a long press brings one only when it has a hold (a `minimumPressDuration` above 0), and `selectionLock: null` opts out. Not exported from the package entry point.

@vjeux
