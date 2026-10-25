---
'@astryxdesign/core': patch
---

[feat] useLongPress takes `stages`: later moments of the same hold, each fired once the finger has stayed that long from the start and still within `moveCancelPx`. ContextMenu claims the finger at its long press and shows its menu at a later stage. `start` also takes the press's start time, so the deadlines can count from a touch's own timestamp.

@vjeux
