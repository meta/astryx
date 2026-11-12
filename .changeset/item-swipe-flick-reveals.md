---
'@astryxdesign/core': patch
---

[fix] `Item`'s swipe actions: under `reveal`, a fling opens the row at its actions; under either model a fling never fires an entry. On a side with two or more entries, only a drag that starts on the open row fires the outermost entry. The panel shows no entry's colour behind another. The entries fill it, and the entry that fires covers it until the row comes back or holds out. No API changes.

@vjeux
