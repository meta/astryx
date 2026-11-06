// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file container.stylex.ts
 * @input Uses @stylexjs/stylex, spacing from theme
 * @output StyleX utility for layout container styling
 * @position Layout utility; used by Card, Section, Dialog, BottomSheet, and
 * Drawer
 *
 * ## Public API for themes
 *
 * Themes set `padding` on container component overrides. The theme build
 * pipeline expands this to component-scoped CSS custom properties, emitting
 * the `--astryx-*` tokens that the component reads:
 *
 *   --astryx-card-padding            (shorthand — all sides; emitted)
 *   --astryx-card-padding-inline     (horizontal)
 *   --astryx-card-padding-block-start
 *   --astryx-card-padding-block-end
 *
 * Read order per level: `var(--astryx-…, <next level>)`, terminating at
 * `--spacing-4`. Same pattern for section, dialog, bottom-sheet, and
 * drawer.
 *
 * ```ts
 * components: {
 *   card: { base: { padding: '20px' } },          // → --astryx-card-padding: 20px
 *   section: { base: { padding: '12px 20px' } },  // → directional tokens
 *   dialog: { base: { padding: '16px' } },
 *   'bottom-sheet': { base: { padding: '16px' } },
 *   drawer: { base: { padding: '16px' } },
 * }
 * ```
 *
 * Internal variables (`--layout-padding-inner-x`, `--container-padding-*`,
 * `--_section-padding-propagated`) are implementation details and must not be
 * referenced by themes. They also do not cross an overlay boundary — see
 * `overlayPaddingReset` in padding.stylex.ts.
 *
 * SYNC: When modified, update /packages/core/src/Layout/Layout.doc.mjs
 */

import * as stylex from '@stylexjs/stylex';
import {spacingVars} from '../theme/tokens.stylex';

/**
 * Spacing token keys for padding props.
 */
export type SpacingToken =
  | 'spacing0'
  | 'spacing0_5'
  | 'spacing1'
  | 'spacing1_5'
  | 'spacing2'
  | 'spacing3'
  | 'spacing4'
  | 'spacing5'
  | 'spacing6'
  | 'spacing7'
  | 'spacing8'
  | 'spacing9'
  | 'spacing10'
  | 'spacing11'
  | 'spacing12';

const baseStyles = stylex.create({
  container: {
    boxSizing: 'border-box',
    paddingInlineStart: 'var(--container-padding-inline-start)',
    paddingInlineEnd: 'var(--container-padding-inline-end)',
    paddingBlockStart: 'var(--container-padding-block-start)',
    paddingBlockEnd: 'var(--container-padding-block-end)',
    // This container's --layout-padding-outer-* below now describe the inset
    // for Layouts inside it; clear any enclosing Layout's own padding, which
    // its regions would otherwise read first.
    '--layout-padding-own-outer-x': 'initial',
    '--layout-padding-own-outer-y': 'initial',
  },
});

/**
 * Component-scoped padding tokens.
 *
 * Each container component (card, section, dialog, bottom-sheet, drawer) has
 * public CSS custom properties that themes can set. The pipeline emits the `--astryx-*` names,
 * which the component reads via `var(--astryx-…, …)`:
 *
 *   --astryx-card-padding          (shorthand — all sides)
 *   --astryx-card-padding-inline
 *   --astryx-card-padding-inline-start
 *   --astryx-card-padding-inline-end
 *   --astryx-card-padding-block-start
 *   --astryx-card-padding-block-end
 *
 * The theme build pipeline maps `padding: '20px'` on a container component
 * to these tokens. The component reads them with var() fallbacks to --spacing-4.
 *
 * This indirection exists because StyleX's useCSSLayers emits priority-0
 * custom property assignments outside any @layer, making them impossible
 * to override from @layer astryx-theme. By reading from a higher-level token,
 * the theme CSS sets the token value and the component picks it up via
 * CSS custom property cascade — no layer competition.
 */
const SP4 = spacingVars['--spacing-4'];

// Card padding chains: --astryx-* then the next specificity level, terminating
// at --spacing-4. Built as chained const strings (no function calls) so StyleX
// can statically analyze them; see naming.ts for the prefix policy.
const cardShorthand = `var(--astryx-card-padding, ${SP4})`;
const cardInline = `var(--astryx-card-padding-inline, ${cardShorthand})`;
const cardInlineStart = `var(--astryx-card-padding-inline-start, ${cardInline})`;
const cardInlineEnd = `var(--astryx-card-padding-inline-end, ${cardInline})`;
const cardBlockStart = `var(--astryx-card-padding-block-start, ${cardShorthand})`;
const cardBlockEnd = `var(--astryx-card-padding-block-end, ${cardShorthand})`;

// Section padding chains: --astryx-* then the next specificity level, terminating
// at --spacing-4. Built as chained const strings (no function calls) so StyleX
// can statically analyze them; see naming.ts for the prefix policy.
// `--_section-padding-propagated` (set by an ancestor Section with explicit
// padding) is read AHEAD of the public theme token, so a propagated value
// still wins over the theme for nested sections. Splitting the two names is
// what lets an overlay drop the inherited value at its boundary while keeping
// the theme's — see `overlayPaddingReset` in padding.stylex.ts.
const sectionThemeShorthand = `var(--astryx-section-padding, ${SP4})`;
const sectionShorthand = `var(--_section-padding-propagated, ${sectionThemeShorthand})`;
const sectionInline = `var(--astryx-section-padding-inline, ${sectionShorthand})`;
const sectionInlineStart = `var(--astryx-section-padding-inline-start, ${sectionInline})`;
const sectionInlineEnd = `var(--astryx-section-padding-inline-end, ${sectionInline})`;
const sectionBlockStart = `var(--astryx-section-padding-block-start, ${sectionShorthand})`;
const sectionBlockEnd = `var(--astryx-section-padding-block-end, ${sectionShorthand})`;

// Dialog padding chains: --astryx-* then the next specificity level, terminating
// at --spacing-4. Built as chained const strings (no function calls) so StyleX
// can statically analyze them; see naming.ts for the prefix policy.
const dialogShorthand = `var(--astryx-dialog-padding, ${SP4})`;
const dialogInline = `var(--astryx-dialog-padding-inline, ${dialogShorthand})`;
const dialogInlineStart = `var(--astryx-dialog-padding-inline-start, ${dialogInline})`;
const dialogInlineEnd = `var(--astryx-dialog-padding-inline-end, ${dialogInline})`;
const dialogBlockStart = `var(--astryx-dialog-padding-block-start, ${dialogShorthand})`;
const dialogBlockEnd = `var(--astryx-dialog-padding-block-end, ${dialogShorthand})`;

// Bottom sheet padding chains: --astryx-* then the next specificity level,
// terminating at --spacing-4 like Dialog. Built as chained const strings (no
// function calls) so StyleX can statically analyze them; see naming.ts for the
// prefix policy.
const bottomSheetShorthand = `var(--astryx-bottom-sheet-padding, ${SP4})`;
const bottomSheetInline = `var(--astryx-bottom-sheet-padding-inline, ${bottomSheetShorthand})`;
const bottomSheetInlineStart = `var(--astryx-bottom-sheet-padding-inline-start, ${bottomSheetInline})`;
const bottomSheetInlineEnd = `var(--astryx-bottom-sheet-padding-inline-end, ${bottomSheetInline})`;
const bottomSheetBlockStart = `var(--astryx-bottom-sheet-padding-block-start, ${bottomSheetShorthand})`;
const bottomSheetBlockEnd = `var(--astryx-bottom-sheet-padding-block-end, ${bottomSheetShorthand})`;

// Drawer padding chains: --astryx-* then the next specificity level,
// terminating at --spacing-4 like Dialog. Built as chained const strings (no
// function calls) so StyleX can statically analyze them; see naming.ts for the
// prefix policy.
const drawerShorthand = `var(--astryx-drawer-padding, ${SP4})`;
const drawerInline = `var(--astryx-drawer-padding-inline, ${drawerShorthand})`;
const drawerInlineStart = `var(--astryx-drawer-padding-inline-start, ${drawerInline})`;
const drawerInlineEnd = `var(--astryx-drawer-padding-inline-end, ${drawerInline})`;
const drawerBlockStart = `var(--astryx-drawer-padding-block-start, ${drawerShorthand})`;
const drawerBlockEnd = `var(--astryx-drawer-padding-block-end, ${drawerShorthand})`;

const cardDefaultPaddingStyles = stylex.create({
  containerPaddingInlineStart: {
    '--container-padding-inline-start': cardInlineStart,
  },
  containerPaddingInlineEnd: {
    '--container-padding-inline-end': cardInlineEnd,
  },
  containerPaddingBlockStart: {
    '--container-padding-block-start': cardBlockStart,
  },
  containerPaddingBlockEnd: {
    '--container-padding-block-end': cardBlockEnd,
  },
  layoutPaddingOuterX: {
    '--layout-padding-outer-x': cardInlineStart,
  },
  layoutPaddingOuterY: {
    '--layout-padding-outer-y': cardBlockStart,
  },
  layoutPaddingInnerX: {
    '--layout-padding-inner-x': cardInlineStart,
  },
  layoutPaddingInnerY: {
    '--layout-padding-inner-y': cardBlockStart,
  },
});

const sectionDefaultPaddingStyles = stylex.create({
  containerPaddingInlineStart: {
    '--container-padding-inline-start': sectionInlineStart,
  },
  containerPaddingInlineEnd: {
    '--container-padding-inline-end': sectionInlineEnd,
  },
  containerPaddingBlockStart: {
    '--container-padding-block-start': sectionBlockStart,
  },
  containerPaddingBlockEnd: {
    '--container-padding-block-end': sectionBlockEnd,
  },
  layoutPaddingOuterX: {
    '--layout-padding-outer-x': sectionInlineStart,
  },
  layoutPaddingOuterY: {
    '--layout-padding-outer-y': sectionBlockStart,
  },
  layoutPaddingInnerX: {
    '--layout-padding-inner-x': sectionInlineStart,
  },
  layoutPaddingInnerY: {
    '--layout-padding-inner-y': sectionBlockStart,
  },
});

const dialogDefaultPaddingStyles = stylex.create({
  containerPaddingInlineStart: {
    '--container-padding-inline-start': dialogInlineStart,
  },
  containerPaddingInlineEnd: {
    '--container-padding-inline-end': dialogInlineEnd,
  },
  containerPaddingBlockStart: {
    '--container-padding-block-start': dialogBlockStart,
  },
  containerPaddingBlockEnd: {
    '--container-padding-block-end': dialogBlockEnd,
  },
  layoutPaddingOuterX: {
    '--layout-padding-outer-x': dialogInlineStart,
  },
  layoutPaddingOuterY: {
    '--layout-padding-outer-y': dialogBlockStart,
  },
  layoutPaddingInnerX: {
    '--layout-padding-inner-x': dialogInlineStart,
  },
  layoutPaddingInnerY: {
    '--layout-padding-inner-y': dialogBlockStart,
  },
});

const bottomSheetDefaultPaddingStyles = stylex.create({
  containerPaddingInlineStart: {
    '--container-padding-inline-start': bottomSheetInlineStart,
  },
  containerPaddingInlineEnd: {
    '--container-padding-inline-end': bottomSheetInlineEnd,
  },
  containerPaddingBlockStart: {
    '--container-padding-block-start': bottomSheetBlockStart,
  },
  containerPaddingBlockEnd: {
    '--container-padding-block-end': bottomSheetBlockEnd,
  },
  layoutPaddingOuterX: {
    '--layout-padding-outer-x': bottomSheetInlineStart,
  },
  layoutPaddingOuterY: {
    '--layout-padding-outer-y': bottomSheetBlockStart,
  },
  layoutPaddingInnerX: {
    '--layout-padding-inner-x': bottomSheetInlineStart,
  },
  layoutPaddingInnerY: {
    '--layout-padding-inner-y': bottomSheetBlockStart,
  },
});

const drawerDefaultPaddingStyles = stylex.create({
  containerPaddingInlineStart: {
    '--container-padding-inline-start': drawerInlineStart,
  },
  containerPaddingInlineEnd: {
    '--container-padding-inline-end': drawerInlineEnd,
  },
  containerPaddingBlockStart: {
    '--container-padding-block-start': drawerBlockStart,
  },
  containerPaddingBlockEnd: {
    '--container-padding-block-end': drawerBlockEnd,
  },
  layoutPaddingOuterX: {
    '--layout-padding-outer-x': drawerInlineStart,
  },
  layoutPaddingOuterY: {
    '--layout-padding-outer-y': drawerBlockStart,
  },
  layoutPaddingInnerX: {
    '--layout-padding-inner-x': drawerInlineStart,
  },
  layoutPaddingInnerY: {
    '--layout-padding-inner-y': drawerBlockStart,
  },
});

/**
 * Map from component name to its theme default padding styles.
 * Each component reads from its own public CSS custom property.
 */
const themeDefaultStyles = {
  card: cardDefaultPaddingStyles,
  section: sectionDefaultPaddingStyles,
  dialog: dialogDefaultPaddingStyles,
  'bottom-sheet': bottomSheetDefaultPaddingStyles,
  drawer: drawerDefaultPaddingStyles,
};

export type ContainerComponent = keyof typeof themeDefaultStyles;

/**
 * Container inline padding styles for edge compensation.
 * Sets --container-padding-inline-start and --container-padding-inline-end so
 * edge-compensating children (bleed tables, dividers, etc.) know the inline
 * padding to compensate against.
 */
const containerPaddingInlineStartStyles = stylex.create({
  spacing0: {'--container-padding-inline-start': spacingVars['--spacing-0']},
  spacing0_5: {
    '--container-padding-inline-start': spacingVars['--spacing-0-5'],
  },
  spacing1: {'--container-padding-inline-start': spacingVars['--spacing-1']},
  spacing1_5: {
    '--container-padding-inline-start': spacingVars['--spacing-1-5'],
  },
  spacing2: {'--container-padding-inline-start': spacingVars['--spacing-2']},
  spacing3: {'--container-padding-inline-start': spacingVars['--spacing-3']},
  spacing4: {'--container-padding-inline-start': spacingVars['--spacing-4']},
  spacing5: {'--container-padding-inline-start': spacingVars['--spacing-5']},
  spacing6: {'--container-padding-inline-start': spacingVars['--spacing-6']},
  spacing7: {'--container-padding-inline-start': spacingVars['--spacing-7']},
  spacing8: {'--container-padding-inline-start': spacingVars['--spacing-8']},
  spacing9: {'--container-padding-inline-start': spacingVars['--spacing-9']},
  spacing10: {'--container-padding-inline-start': spacingVars['--spacing-10']},
  spacing11: {'--container-padding-inline-start': spacingVars['--spacing-11']},
  spacing12: {'--container-padding-inline-start': spacingVars['--spacing-12']},
});

const containerPaddingInlineEndStyles = stylex.create({
  spacing0: {'--container-padding-inline-end': spacingVars['--spacing-0']},
  spacing0_5: {'--container-padding-inline-end': spacingVars['--spacing-0-5']},
  spacing1: {'--container-padding-inline-end': spacingVars['--spacing-1']},
  spacing1_5: {'--container-padding-inline-end': spacingVars['--spacing-1-5']},
  spacing2: {'--container-padding-inline-end': spacingVars['--spacing-2']},
  spacing3: {'--container-padding-inline-end': spacingVars['--spacing-3']},
  spacing4: {'--container-padding-inline-end': spacingVars['--spacing-4']},
  spacing5: {'--container-padding-inline-end': spacingVars['--spacing-5']},
  spacing6: {'--container-padding-inline-end': spacingVars['--spacing-6']},
  spacing7: {'--container-padding-inline-end': spacingVars['--spacing-7']},
  spacing8: {'--container-padding-inline-end': spacingVars['--spacing-8']},
  spacing9: {'--container-padding-inline-end': spacingVars['--spacing-9']},
  spacing10: {'--container-padding-inline-end': spacingVars['--spacing-10']},
  spacing11: {'--container-padding-inline-end': spacingVars['--spacing-11']},
  spacing12: {'--container-padding-inline-end': spacingVars['--spacing-12']},
});

/**
 * Container block-start/block-end padding styles for vertical bleed.
 * Split into start and end because Layout areas have asymmetric block padding
 * (e.g., Header: block-start=outer-y, block-end=inner-y).
 */
const containerPaddingBlockStartStyles = stylex.create({
  spacing0: {'--container-padding-block-start': spacingVars['--spacing-0']},
  spacing0_5: {'--container-padding-block-start': spacingVars['--spacing-0-5']},
  spacing1: {'--container-padding-block-start': spacingVars['--spacing-1']},
  spacing1_5: {'--container-padding-block-start': spacingVars['--spacing-1-5']},
  spacing2: {'--container-padding-block-start': spacingVars['--spacing-2']},
  spacing3: {'--container-padding-block-start': spacingVars['--spacing-3']},
  spacing4: {'--container-padding-block-start': spacingVars['--spacing-4']},
  spacing5: {'--container-padding-block-start': spacingVars['--spacing-5']},
  spacing6: {'--container-padding-block-start': spacingVars['--spacing-6']},
  spacing7: {'--container-padding-block-start': spacingVars['--spacing-7']},
  spacing8: {'--container-padding-block-start': spacingVars['--spacing-8']},
  spacing9: {'--container-padding-block-start': spacingVars['--spacing-9']},
  spacing10: {'--container-padding-block-start': spacingVars['--spacing-10']},
  spacing11: {'--container-padding-block-start': spacingVars['--spacing-11']},
  spacing12: {'--container-padding-block-start': spacingVars['--spacing-12']},
});

const containerPaddingBlockEndStyles = stylex.create({
  spacing0: {'--container-padding-block-end': spacingVars['--spacing-0']},
  spacing0_5: {'--container-padding-block-end': spacingVars['--spacing-0-5']},
  spacing1: {'--container-padding-block-end': spacingVars['--spacing-1']},
  spacing1_5: {'--container-padding-block-end': spacingVars['--spacing-1-5']},
  spacing2: {'--container-padding-block-end': spacingVars['--spacing-2']},
  spacing3: {'--container-padding-block-end': spacingVars['--spacing-3']},
  spacing4: {'--container-padding-block-end': spacingVars['--spacing-4']},
  spacing5: {'--container-padding-block-end': spacingVars['--spacing-5']},
  spacing6: {'--container-padding-block-end': spacingVars['--spacing-6']},
  spacing7: {'--container-padding-block-end': spacingVars['--spacing-7']},
  spacing8: {'--container-padding-block-end': spacingVars['--spacing-8']},
  spacing9: {'--container-padding-block-end': spacingVars['--spacing-9']},
  spacing10: {'--container-padding-block-end': spacingVars['--spacing-10']},
  spacing11: {'--container-padding-block-end': spacingVars['--spacing-11']},
  spacing12: {'--container-padding-block-end': spacingVars['--spacing-12']},
});

const paddingOuterXStyles = stylex.create({
  spacing0: {'--layout-padding-outer-x': spacingVars['--spacing-0']},
  spacing0_5: {'--layout-padding-outer-x': spacingVars['--spacing-0-5']},
  spacing1: {'--layout-padding-outer-x': spacingVars['--spacing-1']},
  spacing1_5: {'--layout-padding-outer-x': spacingVars['--spacing-1-5']},
  spacing2: {'--layout-padding-outer-x': spacingVars['--spacing-2']},
  spacing3: {'--layout-padding-outer-x': spacingVars['--spacing-3']},
  spacing4: {'--layout-padding-outer-x': spacingVars['--spacing-4']},
  spacing5: {'--layout-padding-outer-x': spacingVars['--spacing-5']},
  spacing6: {'--layout-padding-outer-x': spacingVars['--spacing-6']},
  spacing7: {'--layout-padding-outer-x': spacingVars['--spacing-7']},
  spacing8: {'--layout-padding-outer-x': spacingVars['--spacing-8']},
  spacing9: {'--layout-padding-outer-x': spacingVars['--spacing-9']},
  spacing10: {'--layout-padding-outer-x': spacingVars['--spacing-10']},
  spacing11: {'--layout-padding-outer-x': spacingVars['--spacing-11']},
  spacing12: {'--layout-padding-outer-x': spacingVars['--spacing-12']},
});

const paddingOuterYStyles = stylex.create({
  spacing0: {'--layout-padding-outer-y': spacingVars['--spacing-0']},
  spacing0_5: {'--layout-padding-outer-y': spacingVars['--spacing-0-5']},
  spacing1: {'--layout-padding-outer-y': spacingVars['--spacing-1']},
  spacing1_5: {'--layout-padding-outer-y': spacingVars['--spacing-1-5']},
  spacing2: {'--layout-padding-outer-y': spacingVars['--spacing-2']},
  spacing3: {'--layout-padding-outer-y': spacingVars['--spacing-3']},
  spacing4: {'--layout-padding-outer-y': spacingVars['--spacing-4']},
  spacing5: {'--layout-padding-outer-y': spacingVars['--spacing-5']},
  spacing6: {'--layout-padding-outer-y': spacingVars['--spacing-6']},
  spacing7: {'--layout-padding-outer-y': spacingVars['--spacing-7']},
  spacing8: {'--layout-padding-outer-y': spacingVars['--spacing-8']},
  spacing9: {'--layout-padding-outer-y': spacingVars['--spacing-9']},
  spacing10: {'--layout-padding-outer-y': spacingVars['--spacing-10']},
  spacing11: {'--layout-padding-outer-y': spacingVars['--spacing-11']},
  spacing12: {'--layout-padding-outer-y': spacingVars['--spacing-12']},
});

const paddingInnerXStyles = stylex.create({
  spacing0: {'--layout-padding-inner-x': spacingVars['--spacing-0']},
  spacing0_5: {'--layout-padding-inner-x': spacingVars['--spacing-0-5']},
  spacing1: {'--layout-padding-inner-x': spacingVars['--spacing-1']},
  spacing1_5: {'--layout-padding-inner-x': spacingVars['--spacing-1-5']},
  spacing2: {'--layout-padding-inner-x': spacingVars['--spacing-2']},
  spacing3: {'--layout-padding-inner-x': spacingVars['--spacing-3']},
  spacing4: {'--layout-padding-inner-x': spacingVars['--spacing-4']},
  spacing5: {'--layout-padding-inner-x': spacingVars['--spacing-5']},
  spacing6: {'--layout-padding-inner-x': spacingVars['--spacing-6']},
  spacing7: {'--layout-padding-inner-x': spacingVars['--spacing-7']},
  spacing8: {'--layout-padding-inner-x': spacingVars['--spacing-8']},
  spacing9: {'--layout-padding-inner-x': spacingVars['--spacing-9']},
  spacing10: {'--layout-padding-inner-x': spacingVars['--spacing-10']},
  spacing11: {'--layout-padding-inner-x': spacingVars['--spacing-11']},
  spacing12: {'--layout-padding-inner-x': spacingVars['--spacing-12']},
});

const paddingInnerYStyles = stylex.create({
  spacing0: {'--layout-padding-inner-y': spacingVars['--spacing-0']},
  spacing0_5: {'--layout-padding-inner-y': spacingVars['--spacing-0-5']},
  spacing1: {'--layout-padding-inner-y': spacingVars['--spacing-1']},
  spacing1_5: {'--layout-padding-inner-y': spacingVars['--spacing-1-5']},
  spacing2: {'--layout-padding-inner-y': spacingVars['--spacing-2']},
  spacing3: {'--layout-padding-inner-y': spacingVars['--spacing-3']},
  spacing4: {'--layout-padding-inner-y': spacingVars['--spacing-4']},
  spacing5: {'--layout-padding-inner-y': spacingVars['--spacing-5']},
  spacing6: {'--layout-padding-inner-y': spacingVars['--spacing-6']},
  spacing7: {'--layout-padding-inner-y': spacingVars['--spacing-7']},
  spacing8: {'--layout-padding-inner-y': spacingVars['--spacing-8']},
  spacing9: {'--layout-padding-inner-y': spacingVars['--spacing-9']},
  spacing10: {'--layout-padding-inner-y': spacingVars['--spacing-10']},
  spacing11: {'--layout-padding-inner-y': spacingVars['--spacing-11']},
  spacing12: {'--layout-padding-inner-y': spacingVars['--spacing-12']},
});

const maxHeightStyles = stylex.create({
  containerMaxHeight: (maxHeight: string) => ({
    '--container-max-height': maxHeight,
  }),
});

export interface ContainerOptions {
  /**
   * Shortcut to set all padding values at once.
   * Sets paddingOuterX, paddingOuterY, paddingInnerX, and paddingInnerY
   * to the same value. Individual properties override this when set.
   * @default 'spacing4'
   */
  padding?: SpacingToken;

  /**
   * Outer horizontal padding (left/right).
   * Sets --container-padding-inline-start/end and --layout-padding-outer-x CSS variables.
   * Overrides `padding` for the horizontal outer axis.
   */
  paddingOuterX?: SpacingToken;

  /**
   * Outer vertical padding (top/bottom).
   * Sets --container-padding-block-start, --container-padding-block-end, and --layout-padding-outer-y CSS variables.
   * Overrides `padding` for the vertical outer axis.
   */
  paddingOuterY?: SpacingToken;

  /**
   * Inner horizontal padding for content areas.
   * Sets --layout-padding-inner-x CSS variable.
   * Overrides `padding` for the horizontal inner axis.
   */
  paddingInnerX?: SpacingToken;

  /**
   * Inner vertical padding for content areas.
   * Sets --layout-padding-inner-y CSS variable.
   * Overrides `padding` for the vertical inner axis.
   */
  paddingInnerY?: SpacingToken;

  /**
   * When set to a component name ('card' | 'section' | 'dialog' |
   * 'bottom-sheet' | 'drawer'), internal layout
   * padding variables cascade from the component-specific public CSS
   * container tokens (set by theme pipeline from `padding` shorthand)
   * instead of being set to explicit spacing token values.
   *
   * This allows themes to override container padding via component-specific
   * public CSS custom properties without touching internal vars.
   *
   * Used by Card, Section, Dialog, BottomSheet, and Drawer when no explicit
   * padding prop is provided.
   * @default undefined (uses explicit spacing token values)
   */
  useThemeDefault?: ContainerComponent;

  /**
   * Maximum height constraint for the container.
   * Sets --container-max-height CSS variable that Layout reads
   * to enable scroll containment in fill mode.
   * Accepts CSS length values (e.g., '75vh', '500px').
   */
  maxHeight?: string;
}

/**
 * StyleX utility to add layout container styles to any element.
 *
 * Sets CSS variables for padding that child layout components read:
 * - `--container-padding-inline-start` / `--container-padding-inline-end` — Inline padding for edge compensation and bleed
 * - `--container-padding-block-start` / `--container-padding-block-end` — Block padding for vertical bleed
 * - `--layout-padding-outer-x`, `--layout-padding-outer-y` (internal)
 * - `--layout-padding-inner-x`, `--layout-padding-inner-y` (internal)
 *
 * Themes should use `padding` (or `paddingBlock`/`paddingInline`) in
 * component overrides to adjust padding. Do not reference
 * `--layout-padding-*` variables directly.
 *
 * @example
 * ```
 * import { container } from '@astryxdesign/core/Layout';
 * import * as stylex from '@stylexjs/stylex';
 *
 * // Card container with default padding (theme-overridable via padding shorthand)
 * <div {...stylex.props(...container({ useThemeDefault: 'card' }))}>
 *   <Layout ... />
 * </div>
 *
 * // Uniform padding
 * <div {...stylex.props(...container({ padding: 'spacing3' }))}>
 *   <Layout ... />
 * </div>
 *
 * // Asymmetric — padding as base, paddingOuterY overrides vertical
 * <div {...stylex.props(
 *   ...container({ padding: 'spacing3', paddingOuterY: 'spacing2' }),
 *   customStyles.card
 * )}>
 *   <Layout ... />
 * </div>
 * ```
 */
export function container({
  padding = 'spacing4',
  paddingOuterX,
  paddingOuterY,
  paddingInnerX,
  paddingInnerY,
  useThemeDefault,
  maxHeight,
}: ContainerOptions) {
  const outerX = paddingOuterX ?? padding;
  const outerY = paddingOuterY ?? padding;
  const innerX = paddingInnerX ?? padding;
  const innerY = paddingInnerY ?? padding;

  const maxHeightStyle = maxHeight
    ? maxHeightStyles.containerMaxHeight(maxHeight)
    : null;

  // When useThemeDefault is a component name, cascade from the component's
  // public CSS container tokens (set by theme pipeline from `padding` shorthand)
  // so themes can override each component's padding independently.
  if (useThemeDefault) {
    const defaults = themeDefaultStyles[useThemeDefault];
    return [
      baseStyles.container,
      defaults.containerPaddingInlineStart,
      defaults.containerPaddingInlineEnd,
      defaults.containerPaddingBlockStart,
      defaults.containerPaddingBlockEnd,
      defaults.layoutPaddingOuterX,
      defaults.layoutPaddingOuterY,
      defaults.layoutPaddingInnerX,
      defaults.layoutPaddingInnerY,
      maxHeightStyle,
    ] as const;
  }

  return [
    baseStyles.container,
    containerPaddingInlineStartStyles[outerX],
    containerPaddingInlineEndStyles[outerX],
    containerPaddingBlockStartStyles[outerY],
    containerPaddingBlockEndStyles[outerY],
    paddingOuterXStyles[outerX],
    paddingOuterYStyles[outerY],
    paddingInnerXStyles[innerX],
    paddingInnerYStyles[innerY],
    maxHeightStyle,
  ] as const;
}
