---
'@astryxdesign/core': patch
---

[fix] After a mouse drops a List row, in Lab's ListInput and TransferList too, the row under the resting pointer shows its hover controls once the dropped row glides away. While the dropped row glides it takes no hits: a press on its handle still takes it back, a press elsewhere on it does nothing until it rests, and a press beside it reaches the row there.

@cixzhang
