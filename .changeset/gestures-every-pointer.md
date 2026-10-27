---
'@astryxdesign/core': patch
---

[chore] Internal: gestures attach for every pointer, a mouse, a pen and a finger alike (AST-094 FR43). Under a fine primary pointer an element that uses a gesture keeps one passive `pointerdown` listener (a recognizer that claims a moving finger also keeps its blocking `touchmove`), and the page's listeners last only a press. A right click or a ctrl-click on macOS starts no press. A mouse or pen drag that a recognizer claims takes no text selection from then on, anywhere on the page, and a finger is read once where the browser sends Touch Events without exposing `ontouchstart`. A press tracker takes a mouse press as a press, painting at once with no scroll brake. The screen-edge pan stays off under a mouse, a trackpad and a pen unless its caller allows one, and `perEventPointer` is accepted and does nothing. Not exported from the package entry point.

@vjeux
