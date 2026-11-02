---
'@astryxdesign/core': patch
---

[chore] Internal: with the gesture host serving every pointer, a press tracker takes a mouse press as a press, painting at once with no scroll brake (AST-094 FR11); a finger's or a pen's hold that does something keeps text unselected under any primary pointer, a touchscreen laptop's included, while a mouse keeps its released behavior (FR41); a finger is read once where the browser sends Touch Events without exposing `ontouchstart`; and `perEventPointer`, from before FR43, is accepted and does nothing. Not exported from the package entry point.

@vjeux
