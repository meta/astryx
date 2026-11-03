---
'@astryxdesign/core': patch
---

[chore] Internal: the touch presentations' animator reads a call whose first frame came late, and left its start unread, as started at that frame. A retarget or a read before the browser reports the start, of now or of a later time, continues near where the screen has it instead of from the call's first value. A rebase or set that rebuilds one channel's animation in that window reads that channel's first value until the frame that commits it, and the call's other channels keep reading from the first frame. The browser's start, once read, still decides. Not exported from the package entry point.

@vjeux
