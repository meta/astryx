---
'@astryxdesign/core': patch
---

[chore] Internal: source comments in Popover's touch presentation and the transient copy now match what the code does: a touch that starts before the input hold can close the popover, and `measure` reads before the frame writes. Apps see no change.

@vjeux
