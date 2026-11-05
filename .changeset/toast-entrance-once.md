---
'@astryxdesign/core': patch
---

[fix] A toast plays its entrance once. When a `Dialog`, a modal `Drawer` or a bottom sheet with a scrim opens or closes while toasts show, the viewport moves into it or back out, and a toast already on screen now stays where it is instead of sliding in again.

@vjeux
