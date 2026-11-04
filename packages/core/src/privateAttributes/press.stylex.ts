// Copyright (c) Meta Platforms, Inc. and affiliates.

/* eslint-disable @astryx/no-hover-on-disabled -- Every hover branch is
 * nested beneath ENABLED below, as in interactionOverlay.stylex.ts. */

/**
 * @file privateAttributes/press.stylex.ts
 * @input StyleX, the semantic overlay color tokens, the touch press strength
 *   (`pressVars`, utils/interactionOverlay.stylex.ts) and the row layer's
 *   clocks (utils/rowPressLayer.stylex.ts)
 * @output `rowPressLayerStyles`: the compositor press layer for list rows
 *   (`cell`) and its own-image arms for a row on the `backgroundImage`
 *   variant (`cellOnImage`)
 * @position Owner module of the private press attribute for the row layer:
 *   the press controller (utils/pressFeedback.ts) writes the attribute, and
 *   this file reads it. No package entry exports it. Item and TreeList
 *   compose these styles after their overlay variant;
 *   utils/interactionOverlay.cell.test.ts tests them.
 */

import * as stylex from '@stylexjs/stylex';
import {colorVars} from '../theme/tokens.stylex';
import {pressVars} from '../utils/interactionOverlay.stylex';
import {cellPressConsts} from '../utils/rowPressLayer.stylex';

// The overlay's arm selectors (interactionOverlay.stylex.ts), restated here:
// StyleX resolves a style's keys within its own file.
const ENABLED = ':where(:not(:disabled,[aria-disabled="true"]))';
const HOVER_HOVER = '@media (hover: hover)';
const COARSE = '@media (pointer: coarse)';
const PRESSED_ON = '[data-astryx-press="on"]';
const PRESSED_FADING = '[data-astryx-press="fading"]';
/**
 * A press in any of its states: the row layer exists only then, so at rest a
 * row's own `::before` and its stacking are untouched.
 */
const PRESSED_ANY =
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

/**
 * The row layer's clock as CSS. It is the strength release's clock, scaled
 * by the theme's `--_astryx-motion-tempo` up to 1.5, so the layer and the
 * strength land together.
 */
const CELL_RELEASE = `calc(${cellPressConsts.cellReleaseMs}ms * min(var(--_astryx-motion-tempo, 1), 1.5))`;
/** The same clock under Reduce Motion: a tempo may shorten it, never lengthen it. */
const CELL_RELEASE_REDUCED = `min(${cellPressConsts.cellReleaseMs}ms, calc(${cellPressConsts.cellReleaseMs}ms * var(--_astryx-motion-tempo, 1)))`;
const REDUCED_MOTION = '@media (prefers-reduced-motion: reduce)';

/** Opacity 1 → 0: the row layer leaves; its fading arm runs it. */
const cellRelease = stylex.keyframes({
  from: {opacity: 1},
  to: {opacity: 0},
});

/** The release's curve: the table's gentle ease-out. */
const RELEASE_EASE = cellPressConsts.cellReleaseEase;

export const rowPressLayerStyles = stylex.create({
  /**
   * A list row's touch press on a compositor layer (Item, and TreeList's row
   * box), composed AFTER the row's overlay variant (StyleX is last-wins per
   * property). The variant's own touch paint, a gradient whose strength is a
   * registered custom property, animates on the main thread: while script
   * runs, a pressed row would stay at full strength and every frame of the
   * fade would paint. Here the press is an element-sized `::before` under the
   * row's content whose OPACITY is the strength: `on` shows it at once and
   * `fading` runs a keyframe animation of its opacity, 1 → 0, on the cell's
   * release clock (`timing.press`), which engines run on the compositor:
   * it keeps advancing while the main thread is blocked and lays out and
   * paints nothing. Same pixels as the variant's paint at that strength. The
   * variant keeps the hover and a mouse's `:active`. The row must be
   * positioned (the layer is placed absolutely); `isolation: isolate` keeps
   * the layer above the row's background (a selected fill) and below its
   * content. The layer exists only while a press is on or releasing: at rest
   * a row's own `::before` and its stacking are as they were; during a press
   * the layer is the row's `::before`, so a caller's decoration there merges
   * into the layer for that time (decorate with `::after` or a child).
   *
   * Under a finger only (a coarse primary pointer): a fine pointer keeps the
   * variant exactly, with no layer, no stacking context and its own touch
   * paint, so a desktop row is as it was.
   */
  cell: {
    // The `backgroundColor` variant's own image arms (Item's), its touch
    // paint yielding to the layer under a finger. Only the row's own image
    // turns off: the press paint (`--_press-paint`) stays the variant's, so
    // what a row's descendants paint from it still paints. A fine pointer
    // keeps the arms exactly. `cellOnImage` is the same for the
    // `backgroundImage` variant (TreeList's row box).
    backgroundImage: {
      default: null,
      [ENABLED]: {
        default: null,
        [PRESSED_ON]: {default: pressedOverlayImage, [COARSE]: 'none'},
        [PRESSED_FADING]: {default: pressedOverlayImage, [COARSE]: 'none'},
      },
    },
    // Under a finger the strength's own release (a main-thread animation)
    // is dropped: the layer fades instead, on the compositor. A row whose
    // descendant fades at the row's strength (a radio row's circle) brings
    // it back with `pressedAlpha`. A fine pointer keeps it as the variant
    // declares it (its clock and curve are untouched).
    animationName: {
      default: null,
      [PRESSED_FADING]: {default: pressRelease, [COARSE]: 'none'},
    },
    // The stacking context the layer needs, for a press only.
    isolation: {
      default: null,
      [COARSE]: {default: null, [PRESSED_ANY]: 'isolate'},
    },
    // The whole layer is under a finger only, and only while a press is on
    // or releasing: with a fine pointer none of it applies, and at rest a
    // row's own `::before` is exactly as it was.
    '::before': {
      content: {
        default: null,
        [COARSE]: {
          default: null,
          [ENABLED]: {default: null, [PRESSED_ANY]: '""'},
        },
      },
      position: {
        default: null,
        [COARSE]: {default: null, [PRESSED_ANY]: 'absolute'},
      },
      inset: {default: null, [COARSE]: {default: null, [PRESSED_ANY]: 0}},
      zIndex: {default: null, [COARSE]: {default: null, [PRESSED_ANY]: -1}},
      borderRadius: {
        default: null,
        [COARSE]: {default: null, [PRESSED_ANY]: 'inherit'},
      },
      pointerEvents: {
        default: null,
        [COARSE]: {default: null, [PRESSED_ANY]: 'none'},
      },
      backgroundColor: {
        default: null,
        [COARSE]: {
          default: null,
          [PRESSED_ANY]: colorVars['--color-overlay-pressed'],
        },
      },
      // On at once while the press is believed; nothing transitions it.
      opacity: {
        default: null,
        [COARSE]: {default: null, [PRESSED_ON]: 1, [PRESSED_FADING]: 0},
      },
      animationName: {
        default: null,
        [COARSE]: {
          default: null,
          [ENABLED]: {default: null, [PRESSED_FADING]: cellRelease},
        },
      },
      animationDuration: {
        default: null,
        [COARSE]: {
          default: null,
          [PRESSED_FADING]: {
            default: CELL_RELEASE,
            [REDUCED_MOTION]: CELL_RELEASE_REDUCED,
          },
        },
      },
      animationTimingFunction: {
        default: null,
        [COARSE]: {
          default: null,
          [PRESSED_FADING]: RELEASE_EASE,
        },
      },
      animationFillMode: {
        default: null,
        [COARSE]: {default: null, [PRESSED_FADING]: 'both'},
      },
    },
  },
  /**
   * A row that keeps no press paint of its own, composed after `cell`: a
   * radio row, whose circle paints the press. The row paints no overlay
   * image, keeps the strength's own release (the circle's layer reads the
   * strength), and under a finger has no `::before` box and is no stacking
   * context during a press.
   */
  cellWithoutLayer: {
    backgroundImage: 'none',
    animationName: {default: null, [PRESSED_FADING]: pressRelease},
    isolation: {
      default: null,
      [COARSE]: {default: null, [PRESSED_ANY]: 'auto'},
    },
    '::before': {
      content: {
        default: null,
        [COARSE]: {
          default: null,
          [ENABLED]: {default: null, [PRESSED_ANY]: 'none'},
        },
      },
    },
  },
  /**
   * `cell`'s own-image arms for a row on the `backgroundImage` variant
   * (TreeList's row box), composed after `cell`: the variant's arms, its
   * touch press paint yielding to the layer under a coarse primary pointer.
   */
  cellOnImage: {
    backgroundImage: {
      default: null,
      [ENABLED]: {
        default: null,
        ':active': {
          default: pressedImage,
          [COARSE]: 'none',
        },
        [HOVER_HOVER]: {
          default: null,
          ':hover': hoverImage,
          ':active': pressedImage,
        },
        [PRESSED_ON]: {default: pressedOverlayImage, [COARSE]: 'none'},
        [PRESSED_FADING]: {default: pressedOverlayImage, [COARSE]: 'none'},
      },
    },
  },
});
