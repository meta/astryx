---
'@astryxdesign/core': patch
---

[chore] Internal: gestures attach for every pointer, a mouse, a pen and a finger alike (AST-094 FR43). Under a fine primary pointer an element that uses a gesture keeps one passive `pointerdown` listener, and the page's listeners last only a press. A press tracker takes a mouse press as a press, painting at once with no scroll brake. The screen-edge pan stays off under a mouse, a trackpad and a pen unless its caller allows one, and `perEventPointer` is accepted and does nothing. Not exported from the package entry point.

@vjeux
