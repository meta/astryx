// Copyright (c) Meta Platforms, Inc. and affiliates.

/* eslint-disable @astryx/no-hover-on-disabled -- Every hover branch is
 * nested beneath ENABLED below, as in interactionOverlay.stylex.ts. */

/**
 * @file controlPressLayer.ts
 * @input StyleX, the semantic overlay color tokens, the touch press strength
 *   (`pressVars`, interactionOverlay.stylex.ts), the control release's clock
 *   (controlPressLayer.stylex.ts) and the Reduce Motion fade
 * @output `controlPressLayerStyles`: the compositor press layers for a control
 *   on its own surface (`control`: Button) and for a card's `::after`
 *   (`controlOver`)
 * @position Internal to core: core's `exports` do not list this module
 *   (`architecture:public-component-api` INV12). Composed by Button, the
 *   cards and Thumbnail after their overlay variant
 *   (interactionOverlay.stylex.ts).
 */

import * as stylex from '@stylexjs/stylex';
import {reducedMotionFadeConsts} from '../motion/reducedMotion.stylex';
import {colorVars} from '../theme/tokens.stylex';
import {controlPressConsts} from './controlPressLayer.stylex';
import {pressVars} from './interactionOverlay.stylex';
import {cellPressConsts} from './rowPressLayer.stylex';

// The overlay's arm selectors (interactionOverlay.stylex.ts), restated here:
// StyleX resolves a style's keys within its own file.
const ENABLED = ':where(:not(:disabled,[aria-disabled="true"]))';
const HOVER_HOVER = '@media (hover: hover)';
const COARSE = '@media (pointer: coarse)';
const PRESSED_ON = '[data-astryx-press="on"]';
const PRESSED_FADING = '[data-astryx-press="fading"]';
/** A press that is on or fading: Button's press layer exists only then. */
const PRESSED_LIVE =
  ':is([data-astryx-press="on"],[data-astryx-press="fading"])';

const PRESS_ALPHA = pressVars['--astryx-press-alpha'];

const hoverImage = `linear-gradient(${colorVars['--color-overlay-hover']}, ${colorVars['--color-overlay-hover']})`;
const pressedImage = `linear-gradient(${colorVars['--color-overlay-pressed']}, ${colorVars['--color-overlay-pressed']})`;
/** The overlay's paint, read back off the element (its gradient layer). */
const pressedOverlayImage = 'var(--_press-paint-image)';

/**
 * The overlay's strength release (interactionOverlay.stylex.ts), restated so
 * a fine pointer keeps it: the same keyframes, so the same animation.
 */
const pressRelease = stylex.keyframes({
  from: {[PRESS_ALPHA]: 1},
  to: {[PRESS_ALPHA]: 0},
});

/** Opacity 1 → 0: a control's press layer leaves; its fading arm runs it. */
const controlRelease = stylex.keyframes({
  from: {opacity: 1},
  to: {opacity: 0},
});

/** The control release's clock as CSS: the table's value. */
const CONTROL_RELEASE_DURATION = `${controlPressConsts.controlReleaseMs}ms`;
/** A control's release curve: UIButton's, UIKit's easeInEaseOut. */
const CONTROL_RELEASE_EASE = controlPressConsts.controlReleaseEase;
/**
 * A mouse or Space press the controller paints on a touch-first device
 * (pressFeedback.ts `PRESS_INPUT_ATTRIBUTE`): it keeps the fine pointer's
 * 200 ms deselect clock and curve.
 */
const PRESS_INPUT = '[data-astryx-press-input]';
const INPUT_RELEASE_DURATION = `${cellPressConsts.cellReleaseMs}ms`;
const INPUT_RELEASE_EASE = cellPressConsts.cellReleaseEase;
/** Reduce Motion on a coarse primary pointer: the policy's cross-fade. */
const REDUCED_MOTION_RELEASE_DURATION = reducedMotionFadeConsts.duration;

/**
 * The strength's release on the element, for a surface whose own layer runs
 * the release under a coarse primary pointer: as the overlay variants run it
 * for any other pointer, and dropped under a coarse one, where the layer
 * releases on the compositor instead.
 */
const strengthReleaseOutsideCoarse = {
  animationName: {
    default: null,
    '[data-astryx-press="fading"]': {
      default: pressRelease,
      '@media (prefers-reduced-motion: reduce) and (not (pointer: coarse))':
        'none',
      '@media (pointer: coarse)': 'none',
    },
  },
};

/**
 * The `backgroundImage` variant's arms for a mouse (`:active`) and a hover,
 * restated from interactionOverlay.stylex.ts: `control` replaces that
 * variant's `backgroundImage`.
 */
const pointerImageArms = {
  ':active': {
    default: pressedImage,
    [COARSE]: 'none',
  },
  [HOVER_HOVER]: {
    default: null,
    ':hover': hoverImage,
    ':active': pressedImage,
  },
};

export const controlPressLayerStyles = stylex.create({
  /**
   * A control whose press lives on its own surface: Button (and the
   * IconButton and ToggleButton built on it), composed after the
   * `backgroundImage` variant. Under a coarse primary pointer the press is a
   * `::before` layer under the label, present only while a press is on or
   * fading, and its release is UIButton's (`button.highlight`): an opacity
   * animation, which engines run on the compositor. At rest, and with any
   * other pointer, nothing here applies: no layer, no
   * `isolation`, and the variant's own paint and release, as before (the
   * desktop rule, `spec:AST-017` FR59/DEC-25).
   */
  control: {
    // The variant's arms, its touch paint yielding to the layer under a
    // coarse primary pointer.
    backgroundImage: {
      default: null,
      [ENABLED]: {
        default: null,
        ...pointerImageArms,
        [PRESSED_ON]: {default: pressedOverlayImage, [COARSE]: 'none'},
        [PRESSED_FADING]: {default: pressedOverlayImage, [COARSE]: 'none'},
      },
    },
    ...strengthReleaseOutsideCoarse,
    // The layer and its stacking context exist only while a press is on or
    // fading: at rest the control is no stacking context and has no
    // `::before` of its own, so a `::before` a caller styles keeps its
    // opacity, z-index and position.
    isolation: {
      default: null,
      [COARSE]: {
        default: null,
        [ENABLED]: {default: null, [PRESSED_LIVE]: 'isolate'},
      },
    },
    '::before': {
      content: {
        default: null,
        [COARSE]: {
          default: null,
          [ENABLED]: {default: null, [PRESSED_LIVE]: '""'},
        },
      },
      position: {
        default: null,
        [COARSE]: {
          default: null,
          [ENABLED]: {default: null, [PRESSED_LIVE]: 'absolute'},
        },
      },
      inset: {
        default: null,
        [COARSE]: {
          default: null,
          [ENABLED]: {default: null, [PRESSED_LIVE]: 0},
        },
      },
      zIndex: {
        default: null,
        [COARSE]: {
          default: null,
          [ENABLED]: {default: null, [PRESSED_LIVE]: -1},
        },
      },
      borderRadius: {
        default: null,
        [COARSE]: {
          default: null,
          [ENABLED]: {default: null, [PRESSED_LIVE]: 'inherit'},
        },
      },
      pointerEvents: {
        default: null,
        [COARSE]: {
          default: null,
          [ENABLED]: {default: null, [PRESSED_LIVE]: 'none'},
        },
      },
      backgroundColor: {
        default: null,
        [COARSE]: {
          default: null,
          [ENABLED]: {
            default: null,
            [PRESSED_LIVE]: colorVars['--color-overlay-pressed'],
          },
        },
      },
      // Shown at once on the on arm; the release animates 1 → 0 and leaves
      // it at 0 until the controller removes the attribute.
      opacity: {
        default: null,
        [COARSE]: {
          default: null,
          [ENABLED]: {default: null, [PRESSED_ON]: 1, [PRESSED_FADING]: 0},
        },
      },
      animationName: {
        default: null,
        [COARSE]: {
          default: null,
          [ENABLED]: {default: null, [PRESSED_FADING]: controlRelease},
        },
      },
      animationDuration: {
        default: null,
        [COARSE]: {
          default: null,
          [PRESSED_FADING]: {
            default: CONTROL_RELEASE_DURATION,
            // A mouse or Space press keeps the fine pointer's clock.
            [PRESS_INPUT]: {
              default: INPUT_RELEASE_DURATION,
              '@media (prefers-reduced-motion: reduce) and (pointer: coarse)':
                REDUCED_MOTION_RELEASE_DURATION,
            },
            '@media (prefers-reduced-motion: reduce) and (pointer: coarse)':
              REDUCED_MOTION_RELEASE_DURATION,
          },
        },
      },
      animationTimingFunction: {
        default: null,
        [COARSE]: {
          default: null,
          [PRESSED_FADING]: {
            default: CONTROL_RELEASE_EASE,
            [PRESS_INPUT]: {
              default: INPUT_RELEASE_EASE,
              '@media (prefers-reduced-motion: reduce) and (pointer: coarse)':
                reducedMotionFadeConsts.easing,
            },
            '@media (prefers-reduced-motion: reduce) and (pointer: coarse)':
              reducedMotionFadeConsts.easing,
          },
        },
      },
      animationFillMode: {
        default: null,
        [COARSE]: {default: null, [PRESSED_FADING]: 'both'},
      },
    },
  },
  /**
   * A control whose overlay is a `::after` over its content: the cards,
   * composed after `pressedAlpha`. The card owns that `::after` (its box, its
   * hover and mouse colour, and the press's image at the strength). Under a
   * coarse primary pointer the strength holds while the press fades and the
   * `::after`'s opacity releases the paint on the control clock, on the
   * compositor. With any other pointer nothing here applies: the strength's
   * own release runs, as before (the desktop rule, `spec:AST-017` FR59/DEC-25).
   */
  controlOver: {
    ...strengthReleaseOutsideCoarse,
    '::after': {
      animationName: {
        default: null,
        [COARSE]: {
          default: null,
          [ENABLED]: {default: null, [PRESSED_FADING]: controlRelease},
        },
      },
      animationDuration: {
        default: null,
        [COARSE]: {
          default: null,
          [PRESSED_FADING]: {
            default: CONTROL_RELEASE_DURATION,
            // A mouse or Space press keeps the fine pointer's clock.
            [PRESS_INPUT]: {
              default: INPUT_RELEASE_DURATION,
              '@media (prefers-reduced-motion: reduce) and (pointer: coarse)':
                REDUCED_MOTION_RELEASE_DURATION,
            },
            '@media (prefers-reduced-motion: reduce) and (pointer: coarse)':
              REDUCED_MOTION_RELEASE_DURATION,
          },
        },
      },
      animationTimingFunction: {
        default: null,
        [COARSE]: {
          default: null,
          [PRESSED_FADING]: {
            default: CONTROL_RELEASE_EASE,
            [PRESS_INPUT]: {
              default: INPUT_RELEASE_EASE,
              '@media (prefers-reduced-motion: reduce) and (pointer: coarse)':
                reducedMotionFadeConsts.easing,
            },
            '@media (prefers-reduced-motion: reduce) and (pointer: coarse)':
              reducedMotionFadeConsts.easing,
          },
        },
      },
      animationFillMode: {
        default: null,
        [COARSE]: {default: null, [PRESSED_FADING]: 'both'},
      },
    },
  },
});
