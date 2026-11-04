---
'@astryxdesign/core': patch
---

[fix] Motion: a call made while an animation settles, with the element already still on screen, waits for the browser's first frame as a call from rest does. A busy page no longer skips the start of the new motion, a jump of up to about 14 px at a Switch's return.

@vjeux
