---
'@astryxdesign/core': patch
---

[chore] Internal: the touch presentations' animator reads a call whose first frame came late, and left its start unread, as started by that frame at the latest, so a retarget or a read before the browser reports the start continues from where the screen has it instead of from the call's first value. The browser's start, once read, still decides. Not exported from the package entry point.

@vjeux
