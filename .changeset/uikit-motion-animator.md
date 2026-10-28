---
'@astryxdesign/core': patch
---

[chore] Internal: a compositor animator for touch presentations. It plays UIKit's springs, and scroll coasts (built by a separate coast module, so a surface that never coasts does not carry them; `decay` plays momentum, and sends a spring back from past an edge through the Reduce Motion policy: a cross-fade on a coarse pointer or after a touch release, at once elsewhere) as Web Animations on translate, rotate, scale and opacity, so they keep running while JavaScript is busy, and reads values and velocities back from the curves for interruption, retargeting and Reduce Motion cross-fades. Not exported from the package entry point; no component uses it yet.

@vjeux
