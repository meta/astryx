---
'@astryxdesign/core': patch
---

[chore] Internal: `useLongPress` (ContextMenu's long press, and the held finger that opens a menu from its trigger) takes its default duration and tolerance, 500ms and 10px on either axis, from the same source as the long-press gesture recognizer. No behavior changes.

@vjeux
