---
'@astryxdesign/core': patch
---

[chore] Internal: `useLongPress` takes its default duration and tolerance, 500ms and 10px on either axis, from the same source as the long-press gesture recognizer, so ContextMenu's long press behaves as before. A finger held on a DropdownMenu trigger passes its own 13px allowance instead (see the trigger drift fix).

@vjeux
