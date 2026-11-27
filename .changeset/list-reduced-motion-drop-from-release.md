---
'@astryxdesign/core': patch
---

[fix] Under Reduce Motion, a List drop's cross-fade, in Lab's ListInput and TransferList too, is timed from the release, so it ends within 200 ms of lifting the finger instead of starting a frame or more later.

@cixzhang
