---
'@astryxdesign/core': patch
---

[chore] Internal: under a finger or pen on a coarse primary pointer, the gesture host turns text selection and the touch callout off for one held contact only on elements whose hold does something (`spec:AST-094` FR41, DEC-9). A long press with a hold brings that lock by default (one at 0 ms, a touch-down detector, brings none, and `selectionLock: null` opts out), and another recognizer opts in with the internal `selectionLock` option (a slider's thumb, a switch's drag); the host calls the locks and never imports one. Everything else keeps the browser's long-press selection. Not exported from the package entry point.

@vjeux
