---
'@astryxdesign/core': patch
---

[feat] The animator from `createAnimator` and `useAnimator` takes a start time: `animate(target, {at})` starts the motion at `at`, a time on the document timeline in ms (the `performance.now()` clock). Without it, the motion starts when the browser commits the call, which can be long after the call in a busy task. A FLIP that measured its layout at the call can now date its motion there too, and one `at` puts several animators on one clock.
@vjeux
