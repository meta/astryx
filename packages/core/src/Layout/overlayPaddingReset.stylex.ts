// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file overlayPaddingReset.stylex.ts
 * @input Uses @stylexjs/stylex
 * @output overlayPaddingReset: the container padding boundary at an overlay's root
 * @position Layout utility, re-exported by padding.stylex.ts and Layout/index.ts.
 *   Its own module so an overlay's eager code (useLayer) imports it without
 *   padding.stylex.ts: a lazily loaded overlay that uses the container padding
 *   styles there then keeps them out of the eager chunk it shares with this
 *   module.
 */

import * as stylex from '@stylexjs/stylex';

/**
 * Padding-variable reset for overlay roots (Dialog, BottomSheet, Drawer,
 * MobileNav, Lightbox, and every layer surface).
 *
 * ## Why an overlay needs this
 *
 * The container padding system talks to descendants through inherited custom
 * properties: a padded container announces its padding, and children read the
 * value either to apply it or to cancel it with a negative margin
 * (`Section`, `Divider`, `Layout`, `Table`).
 *
 * Inheritance follows the DOM, but an overlay leaves its parent's visual box —
 * a fixed/top-layer `<dialog>` is a DOM descendant of the padded page while
 * being nowhere near it on screen. It inherits values describing padding that
 * is not there, and its content compensates against phantom space: a `Section`
 * inside a 640px sheet rendered 672px wide and hung off both edges (#5208).
 *
 * Two families leak, and they need opposite treatments:
 *
 * - `--container-padding-*` -> `0px`. Descendants SUBTRACT these (bleed
 *   margins). The overlay root has no padding of its own to escape, so the
 *   honest answer is zero. Nested containers that do set padding (a Dialog's
 *   content wrapper) re-announce their own values below this point, so
 *   legitimate edge-to-edge bleed inside the overlay is unaffected.
 * - `--layout-padding-*` and `--_section-padding-propagated` -> `initial`.
 *   Descendants ADD these, so zeroing them would strip padding rather than
 *   restore it. `initial` makes each guaranteed-invalid, so readers fall
 *   through their own `var(…, fallback)` chain and land on the theme default —
 *   which is what an overlay at the top of the tree should show.
 *
 * `initial` is also why propagation moved off `--astryx-section-padding`: that
 * name is public theme surface, set at the theme root, and making it invalid
 * here would blank the theme's own section padding inside every overlay.
 *
 * Apply on the overlay's outermost styled element.
 *
 * @example
 * ```
 * <dialog {...stylex.props(styles.dialog, overlayPaddingReset.reset)} />
 * ```
 */
export const overlayPaddingReset = stylex.create({
  reset: {
    // Subtracted by descendants — the overlay root has no padding to escape.
    '--container-padding-inline-start': '0px',
    '--container-padding-inline-end': '0px',
    '--container-padding-block-start': '0px',
    '--container-padding-block-end': '0px',
    // Added by descendants — fall through to each reader's own default.
    '--layout-padding-outer-x': 'initial',
    '--layout-padding-outer-y': 'initial',
    '--layout-padding-own-outer-x': 'initial',
    '--layout-padding-own-outer-y': 'initial',
    '--layout-padding-inner-x': 'initial',
    '--layout-padding-inner-y': 'initial',
    '--_section-padding-propagated': 'initial',
  },
});
