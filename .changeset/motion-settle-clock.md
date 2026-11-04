---
'@astryxdesign/core': patch
---

[chore] Internal: the motion foundation's `resolveSettleMs` gives a spring role's settling time at the theme's tempo, so a CSS part that plays with the spring can start and land with it. The layout glide lasts that same time. No component uses it yet. Not exported from the package entry point.

@vjeux
