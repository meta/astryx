---
'@astryxdesign/core': patch
---

[fix] A touch gesture's deadline now runs after the input stamped before it. Behind a blocked page, a finger's or pen's deadline whose timer runs more than 17 ms late waits 50 ms for input still queued. Each input from before it that comes late keeps it waiting. A mouse's or trackpad's deadline does not wait. A deadline that falls among a coalesced move's samples runs between them. A List reorder hold or a Pager's catch whose finger drifted or lifted in time now ends as it should.

@vjeux
