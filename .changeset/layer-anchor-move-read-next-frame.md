---
'@astryxdesign/core': patch
---

[fix] A tall tooltip, or any layer that keeps clear of its trigger, no longer covers the trigger for an extra frame when the page scrolls on a busy device. The layer re-checks its place in the frame after the scroll, before that frame paints, so the trigger stays visible from the second frame on.

@cixzhang
