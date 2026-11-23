---
'@astryxdesign/core': patch
---

[perf] Animators that spring from one value to one target with one spring, in one task, now bake their keyframes once and share them. A list that moves its rows home with `createAnimator` in one task samples the spring once instead of once per row. The keyframes are the same as before.

@vjeux
