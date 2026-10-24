---
'@astryxdesign/core': patch
---

[fix] The experimental touch animator follows design:reduced-motion. Under Reduce Motion every `animate` and `play` (travel or opacity, on a spring or any curve) becomes an opacity-only cross-fade of 200 ms on a coarse primary pointer, or for a call marked `touchRelease`, and completes at once on any other pointer; nothing moves, scales or springs, and travel lands with a plain style write while the element is transparent, never as an animated transform. `timing.reducedMotionCrossFadeMs` is now 200 ms and is no longer a theme role. The `reducedMotion` and `crossfade` call options are removed; `crossfadeAs` stays. `animator.reducedMotion()` reports the mode for feedback with no fade of its own, `reducedMotionFade()` gives the same fade to code beside the animator, and `reducedMotion.stylex.ts` holds its constants for StyleX transitions.

@vjeux
