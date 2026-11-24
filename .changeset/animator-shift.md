---
'@astryxdesign/core': patch
---

[feat] The animator from `createAnimator` and `useAnimator` moves channels by an amount while their motion goes on: `shift(offsets)`. After a layout change moved an element by `dy`, `shift({y: -dy})` keeps it where it is drawn. A channel on a spring keeps its spring, velocity and target, so a glide carries on instead of starting over. A coast shifts whole, and a channel at rest takes the amount and stays.
@vjeux
