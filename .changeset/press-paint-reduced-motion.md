---
'@astryxdesign/core': patch
---

[fix] Under Reduce Motion the shared press paint's release follows design:reduced-motion: with a coarse primary pointer it is the system cross-fade (its duration and curve from `reducedMotionFadeConsts`), and with any other pointer it completes at the lift with no animation.

@vjeux
