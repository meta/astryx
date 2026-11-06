---
'@astryxdesign/core': patch
---

[fix] Under Reduce Motion, a cross-fade's move waits for its fade on the fade's own clock. A fade the browser starts late, or one a test harness holds, no longer shows the element jumping, or lets an exit's element go, before it is transparent.

@vjeux
