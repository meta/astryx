// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file layerAnimations.stylex.ts
 * @input Uses StyleX, theme duration/easing tokens, the Reduce Motion fade
 *   constants, the side the layer runtime writes for a shown layer
 * @output Exports shared entry animation styles for layer-based components
 * @position Shared animation primitives; consumed by DropdownMenu, Popover,
 *   HoverCard, Tooltip, Selector, and any component using useLayer
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Layer/layerEntranceSide.ts
 *
 * Provides opt-in entry animations for popover/layer components. Apply one
 * to the element that fills the layer (its surface), not to the layer.
 * Chromium lays an anchored layer out again on each frame that its own
 * style animates. On the layer the entrance still plays, at that cost.
 * An anchored layer's entrance slides from, and scales about, the side the
 * layer lands on after any flip (layerEntranceSide.ts).
 *
 * @example
 * ```
 * import {layerAnimations} from '../Layer/layerAnimations.stylex';
 *
 * // Direction-aware (for components that know placement):
 * layer.render(
 *   <div {...stylex.props(styles.surface, layerAnimations[placement])}>
 *     <Content />
 *   </div>,
 * );
 *
 * // usePopover's surface takes the hook's `xstyle`:
 * const popover = usePopover({xstyle: layerAnimations.below});
 * ```
 */

import * as stylex from '@stylexjs/stylex';
import {reducedMotionFadeConsts} from '../motion/reducedMotion.stylex';
import {durationVars, easeVars, spacingVars} from '../theme/tokens.stylex';

// The layer runtime writes the side a shown anchored layer landed on. It
// writes a step toward the trigger on each axis (-1, 0 or 1) and the scale's
// origin. It also writes the room to the trigger, which caps the step. Each
// fallback is the placement's own side, used when nothing is written.
const ENTER_X = '--_astryx-layer-enter-x';
const ENTER_Y = '--_astryx-layer-enter-y';
const ENTER_ORIGIN = '--_astryx-layer-enter-origin';
const ENTER_GAP = '--_astryx-layer-enter-gap';
// One step: the spacing token, or the room to the trigger when that is less.
// Without a written gap, the step is the token.
const STEP = `min(${spacingVars['--spacing-2']}, var(${ENTER_GAP}, ${spacingVars['--spacing-2']}))`;

const enterBelow = stylex.keyframes({
  from: {
    opacity: 0,
    transform: `translate(calc(var(${ENTER_X}, 0) * ${STEP}), calc(var(${ENTER_Y}, -1) * ${STEP})) scale(0.95)`,
  },
  to: {opacity: 1, transform: 'translate(0, 0) scale(1)'},
});

const enterAbove = stylex.keyframes({
  from: {
    opacity: 0,
    transform: `translate(calc(var(${ENTER_X}, 0) * ${STEP}), calc(var(${ENTER_Y}, 1) * ${STEP})) scale(0.95)`,
  },
  to: {opacity: 1, transform: 'translate(0, 0) scale(1)'},
});

const enterEnd = stylex.keyframes({
  from: {
    opacity: 0,
    transform: `translate(calc(var(${ENTER_X}, -1) * ${STEP}), calc(var(${ENTER_Y}, 0) * ${STEP})) scale(0.95)`,
  },
  to: {opacity: 1, transform: 'translate(0, 0) scale(1)'},
});

const enterStart = stylex.keyframes({
  from: {
    opacity: 0,
    transform: `translate(calc(var(${ENTER_X}, 1) * ${STEP}), calc(var(${ENTER_Y}, 0) * ${STEP})) scale(0.95)`,
  },
  to: {opacity: 1, transform: 'translate(0, 0) scale(1)'},
});

// RTL: the horizontal fallback is a physical translateX, so it mirrors under
// RTL. A layer on the inline-end or inline-start side then slides in from
// the physical side that follows the reading flow. Only the horizontal
// fallbacks mirror; the vertical ones are direction-neutral. The side the
// runtime writes is physical already.
const enterEndRtl = stylex.keyframes({
  from: {
    opacity: 0,
    transform: `translate(calc(var(${ENTER_X}, 1) * ${STEP}), calc(var(${ENTER_Y}, 0) * ${STEP})) scale(0.95)`,
  },
  to: {opacity: 1, transform: 'translate(0, 0) scale(1)'},
});

const enterStartRtl = stylex.keyframes({
  from: {
    opacity: 0,
    transform: `translate(calc(var(${ENTER_X}, -1) * ${STEP}), calc(var(${ENTER_Y}, 0) * ${STEP})) scale(0.95)`,
  },
  to: {opacity: 1, transform: 'translate(0, 0) scale(1)'},
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
  // The origin is a plain style, not a keyframe: a keyframe that animates it
  // would keep the entrance off the compositor.
  transformOrigin: `var(${ENTER_ORIGIN}, 50% 50%)`,
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
