---
'@astryxdesign/core': patch
---

[chore] Internal: a compositor animator for touch presentations. It plays UIKit's springs, and scroll coasts (built by a separate coast module, so a surface that never coasts does not carry them; `decay` plays a release's momentum, and under Reduce Motion cross-fades a spring back from past an edge) as Web Animations on translate, rotate, scale and opacity, so they keep running while JavaScript is busy, and reads values and velocities back from the curves for interruption, retargeting and Reduce Motion cross-fades. Not exported from the package entry point; no component uses it yet.

@vjeux
