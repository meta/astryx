---
'@astryxdesign/core': patch
---

[chore] Internal: the touch presentations' animator carries a channel on from the screen when a rebase, a set or a retarget that starts now rebuilds it after its call's first frame came late and left the start unread. The channel leaves that call with a start of its own, dated from that frame, instead of starting its curve again; the call's other channels keep waiting for the browser's start. Not exported from the package entry point.

@vjeux
