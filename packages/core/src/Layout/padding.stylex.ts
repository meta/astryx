// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file padding.stylex.ts
 * @input Uses @stylexjs/stylex, spacing from theme
 * @output StyleX styles for numeric padding prop on layout components
 * @position Layout utility; used by Card, Section, and Layout sub-components
 */

import * as stylex from '@stylexjs/stylex';
import {spacingVars} from '../theme/tokens.stylex';
import type {SpacingStep} from '../utils/types';

/**
 * Maps numeric SpacingStep values to SpacingToken keys used by the container system.
 */
export const spacingStepToToken: Record<SpacingStep, string> = {
  0: 'spacing0',
  0.5: 'spacing0_5',
  1: 'spacing1',
  1.5: 'spacing1_5',
  2: 'spacing2',
  3: 'spacing3',
  4: 'spacing4',
  5: 'spacing5',
  6: 'spacing6',
  8: 'spacing8',
  10: 'spacing10',
};

/**
 * Padding styles for all sides using spacing tokens.
 * Each key applies uniform padding to all four sides.
 */
export const paddingStyles = stylex.create({
  0: {
    paddingInlineStart: spacingVars['--spacing-0'],
    paddingInlineEnd: spacingVars['--spacing-0'],
    paddingBlockStart: spacingVars['--spacing-0'],
    paddingBlockEnd: spacingVars['--spacing-0'],
  },
  0.5: {
    paddingInlineStart: spacingVars['--spacing-0-5'],
    paddingInlineEnd: spacingVars['--spacing-0-5'],
    paddingBlockStart: spacingVars['--spacing-0-5'],
    paddingBlockEnd: spacingVars['--spacing-0-5'],
  },
  1: {
    paddingInlineStart: spacingVars['--spacing-1'],
    paddingInlineEnd: spacingVars['--spacing-1'],
    paddingBlockStart: spacingVars['--spacing-1'],
    paddingBlockEnd: spacingVars['--spacing-1'],
  },
  1.5: {
    paddingInlineStart: spacingVars['--spacing-1-5'],
    paddingInlineEnd: spacingVars['--spacing-1-5'],
    paddingBlockStart: spacingVars['--spacing-1-5'],
    paddingBlockEnd: spacingVars['--spacing-1-5'],
  },
  2: {
    paddingInlineStart: spacingVars['--spacing-2'],
    paddingInlineEnd: spacingVars['--spacing-2'],
    paddingBlockStart: spacingVars['--spacing-2'],
    paddingBlockEnd: spacingVars['--spacing-2'],
  },
  3: {
    paddingInlineStart: spacingVars['--spacing-3'],
    paddingInlineEnd: spacingVars['--spacing-3'],
    paddingBlockStart: spacingVars['--spacing-3'],
    paddingBlockEnd: spacingVars['--spacing-3'],
  },
  4: {
    paddingInlineStart: spacingVars['--spacing-4'],
    paddingInlineEnd: spacingVars['--spacing-4'],
    paddingBlockStart: spacingVars['--spacing-4'],
    paddingBlockEnd: spacingVars['--spacing-4'],
  },
  5: {
    paddingInlineStart: spacingVars['--spacing-5'],
    paddingInlineEnd: spacingVars['--spacing-5'],
    paddingBlockStart: spacingVars['--spacing-5'],
    paddingBlockEnd: spacingVars['--spacing-5'],
  },
  6: {
    paddingInlineStart: spacingVars['--spacing-6'],
    paddingInlineEnd: spacingVars['--spacing-6'],
    paddingBlockStart: spacingVars['--spacing-6'],
    paddingBlockEnd: spacingVars['--spacing-6'],
  },
  8: {
    paddingInlineStart: spacingVars['--spacing-8'],
    paddingInlineEnd: spacingVars['--spacing-8'],
    paddingBlockStart: spacingVars['--spacing-8'],
    paddingBlockEnd: spacingVars['--spacing-8'],
  },
  10: {
    paddingInlineStart: spacingVars['--spacing-10'],
    paddingInlineEnd: spacingVars['--spacing-10'],
    paddingBlockStart: spacingVars['--spacing-10'],
    paddingBlockEnd: spacingVars['--spacing-10'],
  },
});

/**
 * Container padding inline CSS variable styles for edge compensation.
 * Sets --container-padding-inline-start and --container-padding-inline-end so
 * edge-compensating children know the inline padding to compensate against.
 */
export const containerPaddingInlineVarStyles = stylex.create({
  0: {
    '--container-padding-inline-start': spacingVars['--spacing-0'],
    '--container-padding-inline-end': spacingVars['--spacing-0'],
  },
  0.5: {
    '--container-padding-inline-start': spacingVars['--spacing-0-5'],
    '--container-padding-inline-end': spacingVars['--spacing-0-5'],
  },
  1: {
    '--container-padding-inline-start': spacingVars['--spacing-1'],
    '--container-padding-inline-end': spacingVars['--spacing-1'],
  },
  1.5: {
    '--container-padding-inline-start': spacingVars['--spacing-1-5'],
    '--container-padding-inline-end': spacingVars['--spacing-1-5'],
  },
  2: {
    '--container-padding-inline-start': spacingVars['--spacing-2'],
    '--container-padding-inline-end': spacingVars['--spacing-2'],
  },
  3: {
    '--container-padding-inline-start': spacingVars['--spacing-3'],
    '--container-padding-inline-end': spacingVars['--spacing-3'],
  },
  4: {
    '--container-padding-inline-start': spacingVars['--spacing-4'],
    '--container-padding-inline-end': spacingVars['--spacing-4'],
  },
  5: {
    '--container-padding-inline-start': spacingVars['--spacing-5'],
    '--container-padding-inline-end': spacingVars['--spacing-5'],
  },
  6: {
    '--container-padding-inline-start': spacingVars['--spacing-6'],
    '--container-padding-inline-end': spacingVars['--spacing-6'],
  },
  8: {
    '--container-padding-inline-start': spacingVars['--spacing-8'],
    '--container-padding-inline-end': spacingVars['--spacing-8'],
  },
  10: {
    '--container-padding-inline-start': spacingVars['--spacing-10'],
    '--container-padding-inline-end': spacingVars['--spacing-10'],
  },
});

/**
 * Container padding block-start/block-end CSS variable styles for vertical bleed.
 * Sets --container-padding-block-start and --container-padding-block-end so bleed children (Table, Divider, Section)
 * know the block padding to compensate against when first/last child.
 */
export const containerPaddingBlockStartVarStyles = stylex.create({
  0: {'--container-padding-block-start': spacingVars['--spacing-0']},
  0.5: {'--container-padding-block-start': spacingVars['--spacing-0-5']},
  1: {'--container-padding-block-start': spacingVars['--spacing-1']},
  1.5: {'--container-padding-block-start': spacingVars['--spacing-1-5']},
  2: {'--container-padding-block-start': spacingVars['--spacing-2']},
  3: {'--container-padding-block-start': spacingVars['--spacing-3']},
  4: {'--container-padding-block-start': spacingVars['--spacing-4']},
  5: {'--container-padding-block-start': spacingVars['--spacing-5']},
  6: {'--container-padding-block-start': spacingVars['--spacing-6']},
  8: {'--container-padding-block-start': spacingVars['--spacing-8']},
  10: {'--container-padding-block-start': spacingVars['--spacing-10']},
});

export const containerPaddingBlockEndVarStyles = stylex.create({
  0: {'--container-padding-block-end': spacingVars['--spacing-0']},
  0.5: {'--container-padding-block-end': spacingVars['--spacing-0-5']},
  1: {'--container-padding-block-end': spacingVars['--spacing-1']},
  1.5: {'--container-padding-block-end': spacingVars['--spacing-1-5']},
  2: {'--container-padding-block-end': spacingVars['--spacing-2']},
  3: {'--container-padding-block-end': spacingVars['--spacing-3']},
  4: {'--container-padding-block-end': spacingVars['--spacing-4']},
  5: {'--container-padding-block-end': spacingVars['--spacing-5']},
  6: {'--container-padding-block-end': spacingVars['--spacing-6']},
  8: {'--container-padding-block-end': spacingVars['--spacing-8']},
  10: {'--container-padding-block-end': spacingVars['--spacing-10']},
});

/**
 * Layout outer X padding CSS variable styles for Layout's `padding` prop.
 *
 * These write `--layout-padding-own-outer-x`, which the Layout's regions read
 * ahead of the inherited `--layout-padding-outer-x` that padding containers
 * (Card, Section, Dialog) publish. Every Layout, padding container, and
 * overlay root clears the `own` value, so one Layout's padding never reaches a
 * nested Layout's regions.
 */
export const layoutPaddingOuterXVarStyles = stylex.create({
  0: {'--layout-padding-own-outer-x': spacingVars['--spacing-0']},
  0.5: {'--layout-padding-own-outer-x': spacingVars['--spacing-0-5']},
  1: {'--layout-padding-own-outer-x': spacingVars['--spacing-1']},
  1.5: {'--layout-padding-own-outer-x': spacingVars['--spacing-1-5']},
  2: {'--layout-padding-own-outer-x': spacingVars['--spacing-2']},
  3: {'--layout-padding-own-outer-x': spacingVars['--spacing-3']},
  4: {'--layout-padding-own-outer-x': spacingVars['--spacing-4']},
  5: {'--layout-padding-own-outer-x': spacingVars['--spacing-5']},
  6: {'--layout-padding-own-outer-x': spacingVars['--spacing-6']},
  8: {'--layout-padding-own-outer-x': spacingVars['--spacing-8']},
  10: {'--layout-padding-own-outer-x': spacingVars['--spacing-10']},
});

/**
 * Layout outer Y padding CSS variable styles; the block-axis counterpart of
 * layoutPaddingOuterXVarStyles.
 */
export const layoutPaddingOuterYVarStyles = stylex.create({
  0: {'--layout-padding-own-outer-y': spacingVars['--spacing-0']},
  0.5: {'--layout-padding-own-outer-y': spacingVars['--spacing-0-5']},
  1: {'--layout-padding-own-outer-y': spacingVars['--spacing-1']},
  1.5: {'--layout-padding-own-outer-y': spacingVars['--spacing-1-5']},
  2: {'--layout-padding-own-outer-y': spacingVars['--spacing-2']},
  3: {'--layout-padding-own-outer-y': spacingVars['--spacing-3']},
  4: {'--layout-padding-own-outer-y': spacingVars['--spacing-4']},
  5: {'--layout-padding-own-outer-y': spacingVars['--spacing-5']},
  6: {'--layout-padding-own-outer-y': spacingVars['--spacing-6']},
  8: {'--layout-padding-own-outer-y': spacingVars['--spacing-8']},
  10: {'--layout-padding-own-outer-y': spacingVars['--spacing-10']},
});

/**
 * Inline-only padding styles.
 * Use when a component needs to set inline (horizontal) padding independently
 * of block padding — e.g. the `paddingX` prop on Stack.
 */
export const paddingInlineStyles = stylex.create({
  0: {
    paddingInlineStart: spacingVars['--spacing-0'],
    paddingInlineEnd: spacingVars['--spacing-0'],
  },
  0.5: {
    paddingInlineStart: spacingVars['--spacing-0-5'],
    paddingInlineEnd: spacingVars['--spacing-0-5'],
  },
  1: {
    paddingInlineStart: spacingVars['--spacing-1'],
    paddingInlineEnd: spacingVars['--spacing-1'],
  },
  1.5: {
    paddingInlineStart: spacingVars['--spacing-1-5'],
    paddingInlineEnd: spacingVars['--spacing-1-5'],
  },
  2: {
    paddingInlineStart: spacingVars['--spacing-2'],
    paddingInlineEnd: spacingVars['--spacing-2'],
  },
  3: {
    paddingInlineStart: spacingVars['--spacing-3'],
    paddingInlineEnd: spacingVars['--spacing-3'],
  },
  4: {
    paddingInlineStart: spacingVars['--spacing-4'],
    paddingInlineEnd: spacingVars['--spacing-4'],
  },
  5: {
    paddingInlineStart: spacingVars['--spacing-5'],
    paddingInlineEnd: spacingVars['--spacing-5'],
  },
  6: {
    paddingInlineStart: spacingVars['--spacing-6'],
    paddingInlineEnd: spacingVars['--spacing-6'],
  },
  8: {
    paddingInlineStart: spacingVars['--spacing-8'],
    paddingInlineEnd: spacingVars['--spacing-8'],
  },
  10: {
    paddingInlineStart: spacingVars['--spacing-10'],
    paddingInlineEnd: spacingVars['--spacing-10'],
  },
});

/**
 * Block-only padding override styles.
 * Use when a component needs to override block padding independently
 * of inline padding (e.g., Toolbar sets tight block padding while
 * inheriting inline padding from its container).
 */
export const paddingBlockStyles = stylex.create({
  0: {
    paddingBlockStart: spacingVars['--spacing-0'],
    paddingBlockEnd: spacingVars['--spacing-0'],
  },
  0.5: {
    paddingBlockStart: spacingVars['--spacing-0-5'],
    paddingBlockEnd: spacingVars['--spacing-0-5'],
  },
  1: {
    paddingBlockStart: spacingVars['--spacing-1'],
    paddingBlockEnd: spacingVars['--spacing-1'],
  },
  1.5: {
    paddingBlockStart: spacingVars['--spacing-1-5'],
    paddingBlockEnd: spacingVars['--spacing-1-5'],
  },
  2: {
    paddingBlockStart: spacingVars['--spacing-2'],
    paddingBlockEnd: spacingVars['--spacing-2'],
  },
  3: {
    paddingBlockStart: spacingVars['--spacing-3'],
    paddingBlockEnd: spacingVars['--spacing-3'],
  },
  4: {
    paddingBlockStart: spacingVars['--spacing-4'],
    paddingBlockEnd: spacingVars['--spacing-4'],
  },
  5: {
    paddingBlockStart: spacingVars['--spacing-5'],
    paddingBlockEnd: spacingVars['--spacing-5'],
  },
  6: {
    paddingBlockStart: spacingVars['--spacing-6'],
    paddingBlockEnd: spacingVars['--spacing-6'],
  },
  8: {
    paddingBlockStart: spacingVars['--spacing-8'],
    paddingBlockEnd: spacingVars['--spacing-8'],
  },
  10: {
    paddingBlockStart: spacingVars['--spacing-10'],
    paddingBlockEnd: spacingVars['--spacing-10'],
  },
});

/**
 * Inline-start-only padding override styles.
 * Use when a component needs to override the inline-start edge independently
 * of inline-end. Logical, so it follows the writing direction (left in LTR,
 * right in RTL).
 */
export const paddingInlineStartStyles = stylex.create({
  0: {paddingInlineStart: spacingVars['--spacing-0']},
  0.5: {paddingInlineStart: spacingVars['--spacing-0-5']},
  1: {paddingInlineStart: spacingVars['--spacing-1']},
  1.5: {paddingInlineStart: spacingVars['--spacing-1-5']},
  2: {paddingInlineStart: spacingVars['--spacing-2']},
  3: {paddingInlineStart: spacingVars['--spacing-3']},
  4: {paddingInlineStart: spacingVars['--spacing-4']},
  5: {paddingInlineStart: spacingVars['--spacing-5']},
  6: {paddingInlineStart: spacingVars['--spacing-6']},
  8: {paddingInlineStart: spacingVars['--spacing-8']},
  10: {paddingInlineStart: spacingVars['--spacing-10']},
});

/**
 * Inline-end-only padding override styles.
 * The inline-end counterpart of paddingInlineStartStyles.
 */
export const paddingInlineEndStyles = stylex.create({
  0: {paddingInlineEnd: spacingVars['--spacing-0']},
  0.5: {paddingInlineEnd: spacingVars['--spacing-0-5']},
  1: {paddingInlineEnd: spacingVars['--spacing-1']},
  1.5: {paddingInlineEnd: spacingVars['--spacing-1-5']},
  2: {paddingInlineEnd: spacingVars['--spacing-2']},
  3: {paddingInlineEnd: spacingVars['--spacing-3']},
  4: {paddingInlineEnd: spacingVars['--spacing-4']},
  5: {paddingInlineEnd: spacingVars['--spacing-5']},
  6: {paddingInlineEnd: spacingVars['--spacing-6']},
  8: {paddingInlineEnd: spacingVars['--spacing-8']},
  10: {paddingInlineEnd: spacingVars['--spacing-10']},
});

/**
 * Container padding inline-start CSS variable style, set independently of
 * inline-end so a per-edge override keeps edge-compensating children (Card,
 * Divider, a nested Section) compensating against the padding actually
 * applied on that edge.
 */
export const containerPaddingInlineStartVarStyles = stylex.create({
  0: {'--container-padding-inline-start': spacingVars['--spacing-0']},
  0.5: {'--container-padding-inline-start': spacingVars['--spacing-0-5']},
  1: {'--container-padding-inline-start': spacingVars['--spacing-1']},
  1.5: {'--container-padding-inline-start': spacingVars['--spacing-1-5']},
  2: {'--container-padding-inline-start': spacingVars['--spacing-2']},
  3: {'--container-padding-inline-start': spacingVars['--spacing-3']},
  4: {'--container-padding-inline-start': spacingVars['--spacing-4']},
  5: {'--container-padding-inline-start': spacingVars['--spacing-5']},
  6: {'--container-padding-inline-start': spacingVars['--spacing-6']},
  8: {'--container-padding-inline-start': spacingVars['--spacing-8']},
  10: {'--container-padding-inline-start': spacingVars['--spacing-10']},
});

/**
 * Container padding inline-end CSS variable style, the counterpart of
 * containerPaddingInlineStartVarStyles.
 */
export const containerPaddingInlineEndVarStyles = stylex.create({
  0: {'--container-padding-inline-end': spacingVars['--spacing-0']},
  0.5: {'--container-padding-inline-end': spacingVars['--spacing-0-5']},
  1: {'--container-padding-inline-end': spacingVars['--spacing-1']},
  1.5: {'--container-padding-inline-end': spacingVars['--spacing-1-5']},
  2: {'--container-padding-inline-end': spacingVars['--spacing-2']},
  3: {'--container-padding-inline-end': spacingVars['--spacing-3']},
  4: {'--container-padding-inline-end': spacingVars['--spacing-4']},
  5: {'--container-padding-inline-end': spacingVars['--spacing-5']},
  6: {'--container-padding-inline-end': spacingVars['--spacing-6']},
  8: {'--container-padding-inline-end': spacingVars['--spacing-8']},
  10: {'--container-padding-inline-end': spacingVars['--spacing-10']},
});

/**
 * Block-start-only padding override styles.
 * Use when a component needs to override the block-start (top) edge
 * independently of block-end — e.g. a section that sits under a sticky
 * header and needs less padding above than below.
 */
export const paddingBlockStartStyles = stylex.create({
  0: {paddingBlockStart: spacingVars['--spacing-0']},
  0.5: {paddingBlockStart: spacingVars['--spacing-0-5']},
  1: {paddingBlockStart: spacingVars['--spacing-1']},
  1.5: {paddingBlockStart: spacingVars['--spacing-1-5']},
  2: {paddingBlockStart: spacingVars['--spacing-2']},
  3: {paddingBlockStart: spacingVars['--spacing-3']},
  4: {paddingBlockStart: spacingVars['--spacing-4']},
  5: {paddingBlockStart: spacingVars['--spacing-5']},
  6: {paddingBlockStart: spacingVars['--spacing-6']},
  8: {paddingBlockStart: spacingVars['--spacing-8']},
  10: {paddingBlockStart: spacingVars['--spacing-10']},
});

/**
 * Block-end-only padding override styles.
 * The block-end counterpart of paddingBlockStartStyles.
 */
export const paddingBlockEndStyles = stylex.create({
  0: {paddingBlockEnd: spacingVars['--spacing-0']},
  0.5: {paddingBlockEnd: spacingVars['--spacing-0-5']},
  1: {paddingBlockEnd: spacingVars['--spacing-1']},
  1.5: {paddingBlockEnd: spacingVars['--spacing-1-5']},
  2: {paddingBlockEnd: spacingVars['--spacing-2']},
  3: {paddingBlockEnd: spacingVars['--spacing-3']},
  4: {paddingBlockEnd: spacingVars['--spacing-4']},
  5: {paddingBlockEnd: spacingVars['--spacing-5']},
  6: {paddingBlockEnd: spacingVars['--spacing-6']},
  8: {paddingBlockEnd: spacingVars['--spacing-8']},
  10: {paddingBlockEnd: spacingVars['--spacing-10']},
});

/**
 * Propagation styles for `--_section-padding-propagated`.
 * When a parent section sets explicit padding, this propagates the value
 * through the CSS custom property cascade so nested sections that use
 * useThemeDefault inherit the parent's padding instead of the theme default.
 *
 * This is deliberately NOT the public `--astryx-section-padding` token. The
 * two carry different authority: the public token is the THEME's section
 * padding, set once at the theme root, while this one is one ancestor
 * Section's padding, propagated down the tree. An overlay has to drop the
 * inherited value at its boundary (see {@link overlayPaddingReset}) without
 * dropping the theme's — impossible while both live under one name.
 * `container.stylex.ts` reads this ahead of the public token, so a propagated
 * value still wins over the theme for nested sections, as before.
 */
export const sectionPaddingPropagationStyles = stylex.create({
  0: {'--_section-padding-propagated': spacingVars['--spacing-0']},
  0.5: {'--_section-padding-propagated': spacingVars['--spacing-0-5']},
  1: {'--_section-padding-propagated': spacingVars['--spacing-1']},
  1.5: {'--_section-padding-propagated': spacingVars['--spacing-1-5']},
  2: {'--_section-padding-propagated': spacingVars['--spacing-2']},
  3: {'--_section-padding-propagated': spacingVars['--spacing-3']},
  4: {'--_section-padding-propagated': spacingVars['--spacing-4']},
  5: {'--_section-padding-propagated': spacingVars['--spacing-5']},
  6: {'--_section-padding-propagated': spacingVars['--spacing-6']},
  8: {'--_section-padding-propagated': spacingVars['--spacing-8']},
  10: {'--_section-padding-propagated': spacingVars['--spacing-10']},
});

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
