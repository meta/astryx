---
'@astryxdesign/core': patch
---

[experimental] The gesture host becomes the one document-level touch owner: `holdPageScroll(decide)` keeps a scroll lock's page still, `watchFingerScrolls` / `isFingerScroll` tell a finger's scroll from the program's, `fingersDown()` counts the fingers on the screen, and `addTouchGate(gate)` holds touches away from a presenting layer. A second finger landing anywhere gives a one-finger pan up so the browser can pinch, a press tracker keeps its touch from the browser's pan once its press is delivered (`TouchConsumer.keepsTouch`), and the host reads the writing direction through `isRtlElement`.

@vjeux
