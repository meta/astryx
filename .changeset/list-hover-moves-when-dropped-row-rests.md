---
'@astryxdesign/core': patch
---

[fix] After a mouse drops a List row, in Lab's ListInput and TransferList too, the row under the resting pointer gets hover, and shows its hover controls, once the dropped row rests. Before, the dropped row could keep hover after it glided away, until the mouse moved.

@cixzhang
