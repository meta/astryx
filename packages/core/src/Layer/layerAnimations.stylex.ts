// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file layerAnimations.stylex.ts
 * @input Uses StyleX, theme duration/easing tokens, the Reduce Motion fade
 *   constants
 * @output Exports shared entry animation styles for layer-based components
 * @position Shared animation primitives; consumed by DropdownMenu, Popover,
 *   HoverCard, Tooltip, Selector, and any component using useLayer
 *
 * Provides opt-in entry animations for popover/layer components.
 * Components apply these via the `xstyle` prop on `layer.render()`.
 *
 * @example
 * ```
 * import {layerAnimations} from '../Layer/layerAnimations.stylex';
 *
 * // Direction-aware (for components that know placement):
 * layer.render(<Content />, {
 *   xstyle: layerAnimations[placement],
 * });
 *
 * // Fixed direction:
 * layer.render(<Content />, {
 *   xstyle: layerAnimations.below,
 * });
 * ```
 */

import * as stylex from '@stylexjs/stylex';
import {reducedMotionFadeConsts} from '../motion/reducedMotion.stylex';
import {durationVars, easeVars, spacingVars} from '../theme/tokens.stylex';

const enterBelow = stylex.keyframes({
  from: {
    opacity: 0,
    transform: `translateY(calc(-1 * ${spacingVars['--spacing-2']})) scale(0.95)`,
  },
  to: {opacity: 1, transform: 'translateY(0) scale(1)'},
});

const enterAbove = stylex.keyframes({
  from: {
    opacity: 0,
    transform: `translateY(${spacingVars['--spacing-2']}) scale(0.95)`,
  },
  to: {opacity: 1, transform: 'translateY(0) scale(1)'},
});

const enterEnd = stylex.keyframes({
  from: {
    opacity: 0,
    transform: `translateX(calc(-1 * ${spacingVars['--spacing-2']})) scale(0.95)`,
  },
  to: {opacity: 1, transform: 'translateX(0) scale(1)'},
});

const enterStart = stylex.keyframes({
  from: {
    opacity: 0,
    transform: `translateX(${spacingVars['--spacing-2']}) scale(0.95)`,
  },
  to: {opacity: 1, transform: 'translateX(0) scale(1)'},
});

// RTL: the horizontal entrance nudge is a physical translateX, so it must
// mirror under RTL — a layer on the inline-end/start side must slide in from
// the correct physical side following the reading flow. Only the horizontal
// (translateX) keyframes need mirroring; the vertical enterAbove/enterBelow
// (translateY) entrances are direction-neutral and are left as-is.
const enterEndRtl = stylex.keyframes({
  from: {
    opacity: 0,
    transform: `translateX(${spacingVars['--spacing-2']}) scale(0.95)`,
  },
  to: {opacity: 1, transform: 'translateX(0) scale(1)'},
});

const enterStartRtl = stylex.keyframes({
  from: {
    opacity: 0,
    transform: `translateX(calc(-1 * ${spacingVars['--spacing-2']})) scale(0.95)`,
  },
  to: {opacity: 1, transform: 'translateX(0) scale(1)'},
});

// Reduce Motion under a finger: the same entrance without its travel. A touch
// presentation substitutes a cross-fade for motion, never a jump.
// The fade's curve rides in its first keyframe, so the published class type
// of `animationTimingFunction` stays the theme ease's.
const fadeIn = stylex.keyframes({
  from: {opacity: 0, animationTimingFunction: reducedMotionFadeConsts.easing},
  to: {opacity: 1},
});

// No theme value lengthens the Reduce Motion fade, so its values are constants.
// The media keys stay literal: StyleX gives an imported at-rule key a later
// priority layer (see reducedMotionKeys).
const animationBase = {
  animationDuration: {
    default: durationVars['--duration-fast-max'],
    '@media (prefers-reduced-motion: reduce) and (pointer: coarse)':
      reducedMotionFadeConsts.duration,
  },
  animationTimingFunction: easeVars['--ease-standard'],
  animationFillMode: 'backwards' as const,
};

/**
 * Shared entry animation styles for layer-based components.
 *
 * Keyed by LayerPlacement ('above' | 'below' | 'start' | 'end')
 * for easy lookup: `layerAnimations[placement]`.
 *
 * Under `prefers-reduced-motion: reduce` each entry drops its travel and
 * scale. Under a finger (the primary pointer is coarse) the layer fades in,
 * opacity only, in 200 ms on easeInOut: on a touch screen Reduce Motion
 * replaces motion with a cross-fade rather than a jump; under any other
 * pointer it appears at once.
 */
export const layerAnimations = stylex.create({
  below: {
    animationName: {
      default: enterBelow,
      '@media (prefers-reduced-motion: reduce) and (not (pointer: coarse))':
        'none',
      '@media (prefers-reduced-motion: reduce) and (pointer: coarse)': fadeIn,
    },
    ...animationBase,
  },
  above: {
    animationName: {
      default: enterAbove,
      '@media (prefers-reduced-motion: reduce) and (not (pointer: coarse))':
        'none',
      '@media (prefers-reduced-motion: reduce) and (pointer: coarse)': fadeIn,
    },
    ...animationBase,
  },
  end: {
    animationName: {
      default: enterEnd,
      ':is([dir="rtl"] *)': enterEndRtl,
      '@media (prefers-reduced-motion: reduce) and (not (pointer: coarse))':
        'none',
      '@media (prefers-reduced-motion: reduce) and (pointer: coarse)': fadeIn,
    },
    ...animationBase,
  },
  start: {
    animationName: {
      default: enterStart,
      ':is([dir="rtl"] *)': enterStartRtl,
      '@media (prefers-reduced-motion: reduce) and (not (pointer: coarse))':
        'none',
      '@media (prefers-reduced-motion: reduce) and (pointer: coarse)': fadeIn,
    },
    ...animationBase,
  },
});
