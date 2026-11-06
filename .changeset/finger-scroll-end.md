---
'@astryxdesign/core': patch
---

[chore] Internal: `useFingerScroll(scroller, {onEnd})` calls `onEnd` each time a finger's scroll on the scroller ends, and the hook is re-exported from the internal touch subpath for Lab components that watch a finger's scroll. Internal entries are outside the public API and its compatibility promise; the hook is not exported from the package entry point or the gestures barrel.

@cixzhang
