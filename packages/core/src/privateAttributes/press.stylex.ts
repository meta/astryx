// Copyright (c) Meta Platforms, Inc. and affiliates.

/* eslint-disable @astryx/no-hover-on-disabled -- Every hover branch is
 * nested beneath ENABLED below, as in interactionOverlay.stylex.ts. */

/**
 * @file privateAttributes/press.stylex.ts
 * @input StyleX, the overlay color tokens, the touch press strength
 *   (`pressVars`) and the theme's exit motion tokens
 * @output `rowPressLayerStyles`, the compositor press layer for list rows,
 *   which Button also composes. Its styles: `cell`, and `cellOnImage` for a
 *   `backgroundImage` row. `cellOnImagePressOnly` is for a row whose fill is
 *   the hover tone, and `overDividers` for a row of a List with dividers. Also
 *   `controlPressLayerStyles`, what Button adds to that layer (`control`),
 *   and `rowPressPaintStyles`, a CheckboxList row's press paint for its box.
 * @position Owner module of the private press attribute: the press controller
 *   (utils/pressFeedback.ts) writes it, and this file reads it. No package
 *   entry exports it. Item, ListItem, TreeList, Button and CheckboxListItem
 *   compose its styles; utils/interactionOverlay.cell.test.ts tests the row layer.
 */

import * as stylex from '@stylexjs/stylex';
import {
  borderVars,
  colorVars,
  durationVars,
  easeVars,
} from '../theme/tokens.stylex';
import {reducedMotionFadeConsts} from '../motion/reducedMotion.stylex';
import {pressVars} from '../utils/interactionOverlay.stylex';

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
 * A press layer's clock as CSS: the strength release's clock, the theme's
 * exit duration, so the layer and the strength land together.
 */
const CELL_RELEASE = durationVars['--duration-exit'];
/** The same clock under Reduce Motion, no longer than the Reduce Motion fade. */
const CELL_RELEASE_REDUCED = `min(${durationVars['--duration-exit']}, ${reducedMotionFadeConsts.duration})`;
const REDUCED_MOTION = '@media (prefers-reduced-motion: reduce)';

/** Opacity 1 → 0: the row layer leaves; its fading arm runs it. */
const cellRelease = stylex.keyframes({
  from: {opacity: 1},
  to: {opacity: 0},
});

/** The release's curve: the theme's exit easing, as the strength's. */
const RELEASE_EASE = easeVars['--ease-exit'];

/** A List divider's width (ListItem's bottom border). */
const DIVIDER_WIDTH = borderVars['--border-width'];
/** How far a highlighted row's tint reaches past its edge: one divider. */
const PAST_DIVIDER = `calc(-1 * ${DIVIDER_WIDTH})`;
/**
 * The surface a travelling List row rides on (travelling.stylex.ts sets it).
 * A row of a List with dividers adds it to its own shadows.
 */
const TRAVELLING_SURFACE = 'var(--_travelling-surface, none)';
/** The same surface as one shadow in a list of them. */
const TRAVELLING_SURFACE_LAYER = 'var(--_travelling-surface, 0 0 transparent)';
/**
 * A tint one divider tall, just above the row: over the row before's divider.
 * A travelling row keeps its surface under the tint.
 */
const tintAbove = (tint: string) =>
  `0 ${PAST_DIVIDER} 0 0 ${tint}, ${TRAVELLING_SURFACE_LAYER}`;

export const rowPressLayerStyles = stylex.create({
  /**
   * A touch press on a compositor layer (Item, TreeList's row box, and
   * Button), composed AFTER the overlay variant (StyleX is last-wins per
   * property). The variant's own touch paint, a gradient whose strength is a
   * registered custom property, animates on the main thread: while script
   * runs, a pressed row would stay at full strength and every frame of the
   * fade would paint. Here the press is an element-sized `::before` under the
   * row's content whose OPACITY is the strength: `on` shows it at once and
   * `fading` runs a keyframe animation of its opacity, 1 → 0, on the
   * theme's exit motion tokens, which engines run on the compositor:
   * it keeps advancing while the main thread is blocked and lays out and
   * paints nothing. Same pixels as the variant's paint at that strength. The
   * variant keeps the hover and a mouse's `:active`. The row must be
   * positioned (the layer is placed absolutely); `isolation: isolate` keeps
   * the layer above the row's background (a selected fill) and below its
   * content. The layer exists only while a press is on or releasing: at rest
   * a row's own `::before` and its stacking are as they were; during a press
   * the layer is the row's `::before`, so a caller's decoration there merges
   * into the layer for that time (decorate with `::after` or a child).
   * Under a finger an interactive List row's `::after` is its touch hit area,
   * so decorate that row with a child.
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
   * A row of a List with dividers, composed after `cell`. Where the primary
   * pointer is fine, its own divider is its border, which paints over its
   * tint. The tint also covers the divider above it, as a shadow, under a
   * mouse or a finger. Under a coarse pointer, the press layer covers both
   * dividers, so they fade with it on the release. The tint is translucent,
   * so a divider under it reads as it does at rest. Each shadow here keeps a
   * travelling row's surface, which this shadow replaces otherwise.
   */
  overDividers: {
    boxShadow: {
      default: TRAVELLING_SURFACE,
      [ENABLED]: {
        default: null,
        ':not(:first-child)': {
          default: null,
          ':active': {
            default: tintAbove(colorVars['--color-overlay-pressed']),
            [COARSE]: TRAVELLING_SURFACE,
          },
          [HOVER_HOVER]: {
            default: null,
            ':hover': tintAbove(colorVars['--color-overlay-hover']),
            ':active': tintAbove(colorVars['--color-overlay-pressed']),
          },
          // A press the controller paints. Under a coarse pointer, the press
          // layer covers the divider above. Elsewhere the strip takes the
          // row's own press paint, which follows the release's strength.
          [PRESSED_ON]: {
            default: tintAbove('var(--_press-paint)'),
            [COARSE]: TRAVELLING_SURFACE,
          },
          [PRESSED_FADING]: {
            default: tintAbove('var(--_press-paint)'),
            [COARSE]: TRAVELLING_SURFACE,
          },
        },
      },
    },
    '::before': {
      insetBlockStart: {
        default: null,
        [COARSE]: {
          default: null,
          ':not(:first-child)': {default: null, [PRESSED_ANY]: PAST_DIVIDER},
        },
      },
      // The last row draws no divider (ListItem).
      insetBlockEnd: {
        default: null,
        [COARSE]: {
          default: null,
          ':not(:last-child)': {default: null, [PRESSED_ANY]: PAST_DIVIDER},
        },
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
  /**
   * `cellOnImage` without the hover arm, for a row whose fill is already the
   * hover tone (a highlighted Item row). A hover layer on it would match a
   * pressed row, so the row shows only its press.
   */
  cellOnImagePressOnly: {
    backgroundImage: {
      default: null,
      [ENABLED]: {
        default: null,
        ':active': {
          default: pressedImage,
          [COARSE]: 'none',
        },
        [PRESSED_ON]: {default: pressedOverlayImage, [COARSE]: 'none'},
        [PRESSED_FADING]: {default: pressedOverlayImage, [COARSE]: 'none'},
      },
    },
  },
});

export const controlPressLayerStyles = stylex.create({
  /**
   * A control whose press lives on its own surface: Button (and the
   * IconButton and ToggleButton built on it), composed after
   * `rowPressLayerStyles.cell` and `cellOnImage`, which give it the row's
   * compositor press layer under a coarse primary pointer. Button's press
   * scale runs as a transition: the browser makes a layer for it and drops
   * that layer at its end, which repaints the button. Under a coarse primary
   * pointer, a layer kept from the touch to the end of the release keeps the
   * release free of Paint. With any other pointer nothing here applies.
   */
  control: {
    willChange: {
      default: null,
      [COARSE]: {default: null, [PRESSED_ANY]: 'transform'},
    },
  },
});

export const rowPressPaintStyles = stylex.create({
  // A box reads its nearest row's value, so a list in a row's content keeps
  // its own rows' paint.
  checkboxRow: {
    '--_checkbox-row-press-paint': {
      default: 'none',
      ':is([data-astryx-press="on"])': 'var(--_press-paint-image)',
      ':is([data-astryx-press="fading"])': 'var(--_press-paint-image)',
    },
  },
});
