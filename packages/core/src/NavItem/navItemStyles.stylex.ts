// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file navItemStyles.stylex.ts
 * @input Uses theme tokens (color, spacing, radius, typography, transition, size)
 * @output Exports shared nav item appearance styles and NavItemSize type
 * @position Shared styles consumed by SideNavItem, TopNavItem (drawer mode),
 *   TopNavMenu (drawer mode), and any custom nav items that need to match.
 *
 * Centralizes the nav item appearance (layout, colors, hover/active/selected states,
 * disabled state) so all nav-like components stay in sync — especially important
 * when TopNav items render inside MobileNav drawers alongside SideNav items.
 *
 * Individual components layer their own overrides (e.g. collapsed mode,
 * indentation) via stylex.props composition.
 *
 * The focus ring is not defined here. Compose
 * `focusOutlineProps.focusVisible` (utils/focusOutline.stylex.ts) at the call
 * site, on whichever element actually takes focus — in a split-action row that
 * is the link and the toggle, not the row that contains them.
 */

export type NavItemSize = 'sm' | 'md' | 'lg';

import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  spacingVars,
  radiusVars,
  typeScaleVars,
  fontWeightVars,
  sizeVars,
} from '../theme/tokens.stylex';

/**
 * Base styles shared by all nav item components.
 * Apply as a foundation and override specific properties as needed.
 *
 * @example
 * ```
 * import {navItemStyles} from '@astryxdesign/core/navItemStyles';
 *
 * const styles = stylex.create({
 *   indented: { paddingInlineStart: spacingVars['--spacing-6'] },
 * });
 *
 * <a {...stylex.props(navItemStyles.item, styles.indented)}>
 *   Dashboard
 * </a>
 * ```
 */
export const navItemStyles = stylex.create({
  /** Base interactive nav item — layout, typography, hover/active states */
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
    width: '100%',
    height: sizeVars['--size-element-md'],
    paddingInline: spacingVars['--spacing-2'],
    paddingBlock: 0,
    borderRadius: radiusVars['--radius-element'],
    borderWidth: 0,
    borderStyle: 'none',
    backgroundColor: 'transparent',
    color: colorVars['--color-text-primary'],
    textDecoration: 'none',
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    fontFamily: 'inherit',
    fontSize: typeScaleVars['--text-label-size'],
    fontWeight: fontWeightVars['--font-weight-normal'],
    lineHeight: typeScaleVars['--text-label-leading'],
    textAlign: 'start',
    boxSizing: 'border-box',
  },

  /** Selected/active page indicator — deemphasized background, medium weight */
  selected: {
    // Forced colors flatten `--color-neutral` away, leaving the current page
    // unmarked; Highlight/HighlightText is the platform convention, as in
    // ToggleButton and SegmentedControlItem. No `forced-color-adjust: none`
    // here — a nav row is not a native control, so the keywords land without
    // it, and it would inherit into `endContent` and pin a Badge's own fill.
    backgroundColor: {
      default: colorVars['--color-neutral'],
      '@media (forced-colors: active)': 'Highlight',
    },
    color: {
      default: null,
      '@media (forced-colors: active)': 'HighlightText',
    },
    fontWeight: fontWeightVars['--font-weight-medium'],
    ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
      '@media (hover: hover)': {
        backgroundColor: {
          default: colorVars['--color-neutral'],
          // Nested, not a sibling `(hover: hover) and (forced-colors:
          // active)` block: as siblings `item`'s hover overlay ties on
          // specificity and wins on source order, erasing the fill.
          '@media (forced-colors: active)': 'Highlight',
        },
      },
    },
    ':active': {
      backgroundColor: {
        default: colorVars['--color-neutral'],
        '@media (forced-colors: active)': 'Highlight',
      },
    },
    // The touch press model writes these instead of `:active`; the selected
    // item keeps its fill under a finger the way it does under a mouse, and
    // paints no overlay at any phase of the press.
    '[data-astryx-press="on"]': {
      backgroundColor: {
        default: colorVars['--color-neutral'],
        '@media (forced-colors: active)': 'Highlight',
      },
      backgroundImage: 'none',
    },
    '[data-astryx-press="fading"]': {
      backgroundColor: {
        default: colorVars['--color-neutral'],
        '@media (forced-colors: active)': 'Highlight',
      },
      backgroundImage: 'none',
    },
  },

  /** Disabled state — muted color, no interaction */
  disabled: {
    color: colorVars['--color-text-disabled'],
    cursor: 'default',
    pointerEvents: 'none' as const,
  },

  /** Small size variant */
  sm: {
    height: sizeVars['--size-element-sm'],
    paddingInline: spacingVars['--spacing-1'],
  },

  /** Medium size variant (default) */
  md: {
    height: sizeVars['--size-element-md'],
    paddingInline: spacingVars['--spacing-2'],
  },

  /** Large size variant */
  lg: {
    height: sizeVars['--size-element-lg'],
    paddingInline: spacingVars['--spacing-2'],
  },
});
