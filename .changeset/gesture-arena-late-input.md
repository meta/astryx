---
'@astryxdesign/core': patch
---

[fix] Behind a blocked page, a touch gesture's deadline waits for the input still queued before it. Touch moves can reach the page a frame after other input. A long press, a List reorder hold or a Pager's catch whose finger drifted or lifted in time now ends as it should. A deadline whose timer runs more than 17 ms late waits 50 ms, and each input from before it that comes late keeps it waiting.

@vjeux
