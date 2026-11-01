---
'@astryxdesign/core': patch
---

[chore] `useResizable`'s size parsing, bound resolution, clamping and snapping, saved-size storage and content-box measurement move unchanged into one internal module, so the factory that follows resolves, clamps, snaps and saves exactly as the hook does. No behavior changes.

@vjeux
