---
'@astryxdesign/core': patch
---

[chore] Internal: the trackpad splitter reads a bunched wheel, one within 1.5 ms of the one before as a main-thread stall delivers it, as the steps it merged. During momentum a bunched wheel is not a jump, so momentum no longer restarts a followed pan, and the steps after it no longer read as a lift. Not exported from the package entry point.

@vjeux
