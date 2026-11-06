// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file reducedMotion.stylex.ts
 * @input StyleX constant definitions
 * @output reducedMotionFadeConsts (the Reduced Motion cross-fade's duration
 *   and easing) for StyleX transitions, and reducedMotionKeys (its two media
 *   keys, which a transition spells literally)
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
