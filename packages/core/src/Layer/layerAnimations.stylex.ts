// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file layerAnimations.stylex.ts
 * @input Uses StyleX, theme duration/easing tokens
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
const fadeIn = stylex.keyframes({
  from: {opacity: 0},
  to: {opacity: 1},
});

const animationBase = {
  animationDuration: {
    default: durationVars['--duration-fast-max'],
    // The cross-fade is 200 ms or less, whatever the theme's duration
    // (design:reduced-motion DR2).
    '@media (prefers-reduced-motion: reduce) and (pointer: coarse)': `min(${durationVars['--duration-fast-max']}, 200ms)`,
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
 * Each entry disables its keyframe animation under
 * `prefers-reduced-motion: reduce` so the layer appears instantly instead of
 * translating/scaling in (infra-6). Under a finger (the primary pointer is
 * coarse) it fades in instead, opacity only and in 200 ms or less: on a touch
 * screen Reduce Motion replaces motion with a cross-fade rather than a jump
 * (design:reduced-motion DR2, DR3), as iOS does for its menus, popovers and
 * tips.
 */
export const layerAnimations = stylex.create({
  below: {
    animationName: {
      default: enterBelow,
      '@media (prefers-reduced-motion: reduce)': 'none',
      '@media (prefers-reduced-motion: reduce) and (pointer: coarse)': fadeIn,
    },
    ...animationBase,
  },
  above: {
    animationName: {
      default: enterAbove,
      '@media (prefers-reduced-motion: reduce)': 'none',
      '@media (prefers-reduced-motion: reduce) and (pointer: coarse)': fadeIn,
    },
    ...animationBase,
  },
  end: {
    animationName: {
      default: enterEnd,
      ':is([dir="rtl"] *)': enterEndRtl,
      '@media (prefers-reduced-motion: reduce)': 'none',
      '@media (prefers-reduced-motion: reduce) and (pointer: coarse)': fadeIn,
    },
    ...animationBase,
  },
  start: {
    animationName: {
      default: enterStart,
      ':is([dir="rtl"] *)': enterStartRtl,
      '@media (prefers-reduced-motion: reduce)': 'none',
      '@media (prefers-reduced-motion: reduce) and (pointer: coarse)': fadeIn,
    },
    ...animationBase,
  },
});
