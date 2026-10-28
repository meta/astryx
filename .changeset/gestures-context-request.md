---
'@astryxdesign/core': patch
---

[chore] Internal: one shared context request from a long press, a right click, or Shift+F10 and the context-menu key (AST-094 FR43), reporting which input made it, one per gesture. A held finger's hold loses to a claim another gesture already made on that finger, and a control that keeps its press for a hold-repeat owns only its hold, so its right click and Shift+F10 still reach the request. A held pen's own context menu event is refused like a held finger's. A two-stage hold commits, then requests at its request time on the gesture clock, at a lift after the commit when asked to, and cancels if the finger drifts first. Not exported from the package entry point.

@vjeux
