---
'@astryxdesign/core': patch
---

[chore] Internal: the touch presentations' animator starts a call from rest, made in a task, at the first frame after it when the browser has not yet told the page that start (Chromium reports a compositor's start a frame or more later), so a retarget or a rebase in that window continues from the value on screen instead of replaying the curve from its start. A call made in a frame callback, or one whose first frame comes after a block, keeps the browser's start. Not exported from the package entry point.

@vjeux
