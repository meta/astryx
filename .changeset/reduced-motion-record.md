---
'@astryxdesign/core': patch
---

[chore] Internal: under Reduce Motion, a call that names the opacity a waiting dip returns to, with no travel, joins that dip instead of fading the element out a second time, and `reducedMotionFade()` resolves the cross-fade's curve as a registered motion role where it plays. Not exported from the package entry point.

@vjeux
