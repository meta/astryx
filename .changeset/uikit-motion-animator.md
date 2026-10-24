---
'@astryxdesign/core': patch
---

[chore] Internal: a compositor animator for touch presentations. It plays UIKit's springs, scroll coasts and any closed-form curve as Web Animations on translate, rotate, scale and opacity, so they keep running while JavaScript is busy, and reads values and velocities back from the curves for interruption, retargeting and Reduce Motion cross-fades. Not exported from the package entry point; no component uses it yet.

@vjeux
