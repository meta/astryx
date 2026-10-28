---
'@astryxdesign/core': patch
---

[chore] Internal: gestures attach for every pointer, a mouse, a pen and a finger alike (AST-094 FR43). Under a fine primary pointer an element that uses a gesture keeps one passive `pointerdown` listener (a recognizer that claims a moving finger also keeps its blocking `touchmove`, and a kept press gets its own only during a press), the page's listeners last only a press and go at a window blur, and a hovering mouse or pen reaches a hover recognizer through two passive listeners on its element. A pen's barrel button, like a right click, starts no press. A right click or a ctrl-click on macOS starts no press. A finger's or a pen's hold that does something keeps text unselected under any primary pointer, a touchscreen laptop's included, while a mouse keeps its released behavior (FR41). A mouse or pen drag that a recognizer claims takes no text selection from then on, anywhere on the page, and a finger is read once where the browser sends Touch Events without exposing `ontouchstart`. A press tracker takes a mouse press as a press, painting at once with no scroll brake. The screen-edge pan is a finger's only: it stays off under a mouse, a trackpad and a pen, and takes no `allowedPointerTypes`, and `perEventPointer` is accepted and does nothing. Not exported from the package entry point.

@vjeux
