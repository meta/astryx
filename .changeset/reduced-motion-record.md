---
'@astryxdesign/core': patch
---

[chore] Internal: Reduce Motion for the touch presentations follows design:reduced-motion beyond the animator too. `reducedMotionFade()` gives code beside the animator the animator's own fade (an opacity-only 200 ms cross-fade on a coarse pointer or after a touch release, at once on any other pointer), `animator.reducedMotion()` reports which form a change takes for feedback that plays no fade of its own, and `reducedMotion.stylex.ts` holds the fade's constants for StyleX transitions. The fade's length is not a theme motion role. Not exported from the package entry point.

@vjeux
