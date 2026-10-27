---
'@astryxdesign/core': patch
---

[chore] Internal: one shared context request from a long press, a right click, or Shift+F10 and the context-menu key (AST-094 FR43), reporting which input made it, one per gesture. A held finger's hold loses to a claim another gesture already made on that finger, and a control that keeps its press for a hold-repeat keeps its own long press, right click and Shift+F10. Not exported from the package entry point.

@vjeux
