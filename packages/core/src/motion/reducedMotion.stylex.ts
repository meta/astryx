// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file reducedMotion.stylex.ts
 * @input StyleX constant definitions
 * @output reducedMotionFadeConsts (the Reduced Motion cross-fade's duration
 *   and easing) for StyleX transitions, reducedMotionKeys (its two media
 *   keys, which a transition spells literally), and reducedMotionTransform
 *   (the parts that drop a transform's duration to zero under a theme that
 *   reduces motion for everyone)
 * @position The CSS side of the Reduced Motion policy (reducedMotion.ts):
 *   values a transition takes under its two Reduce Motion media keys
 *
 * Constants, not theme variables: no theme lengthens the fade
 * (design:reduced-motion DR4). They equal `timing.reducedMotionCrossFadeMs`
 * and `timing.curves.move`, which reducedMotion.test.ts checks.
 *
 * SYNC: When modified, update /packages/core/src/motion/uikit/timing.ts and
 * /packages/core/src/motion/reducedMotion.test.ts.
 */

import * as stylex from '@stylexjs/stylex';

export const reducedMotionFadeConsts = stylex.defineConsts({
  /** The cross-fade under Reduce Motion on a coarse pointer. */
  duration: '200ms',
  /** Core Animation's easeInOut. */
  easing: 'cubic-bezier(0.42, 0, 0.58, 1)',
});

/**
 * The two Reduce Motion media keys, spelled once: under Reduce Motion a coarse
 * primary pointer fades (DR2) and any other completes at once (DR3). A
 * component spells the key literally rather than as a computed key: StyleX
 * puts a constant key in a later priority layer than the literal media key,
 * where it would outrank the element's state styles. reducedMotion.test.ts
 * holds every literal in core to these, exactly.
 */
export const reducedMotionKeys = stylex.defineConsts({
  fade: '@media (prefers-reduced-motion: reduce) and (pointer: coarse)',
  instant:
    '@media (prefers-reduced-motion: reduce) and (not (pointer: coarse))',
});

/**
 * A transform's duration (a turn, a slide, a thumb's travel) under a theme
 * that reduces motion for everyone. Theme writes `--_astryx-reduced-motion: 1`
 * where it writes the reduced-motion mark, so a transition multiplies its
 * duration by `factor` and the transform lands at once there. A slide whose
 * end a script waits for (`transitionend`, a close hold) adds `settle`, so it
 * still ends, after 0.01s. The person's Reduce Motion setting stays a literal
 * media key at each transition.
 */
export const reducedMotionTransform = stylex.defineConsts({
  factor: '(1 - var(--_astryx-reduced-motion, 0))',
  settle: '0.01s * var(--_astryx-reduced-motion, 0)',
});
