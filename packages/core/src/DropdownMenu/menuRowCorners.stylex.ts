// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file menuRowCorners.stylex.ts
 * @input The menu's radius and padding variables
 * @output Exports menuRowCornerStyles: a menu row's corners, each the menu's
 *   corner less the menu's padding, never below 0
 * @position Shared by DropdownMenu's item, checkbox item, radio item and
 *   sub-menu row (and so the context menu, which renders them)
 *
 * Each row corner follows the menu corner it sits in. The theme pipeline
 * writes a variable for each menu corner. A row reads the logical corner,
 * then the physical corner for this direction, then the menu's one radius.
 * Menus stay outside container geometry, and a row subtracts the menu
 * padding, so rows keep this reading of their own.
 */

import * as stylex from '@stylexjs/stylex';
import {spacingVars} from '../theme/tokens.stylex';

export const menuRowCornerStyles = stylex.create({
  root: {
    borderStartStartRadius: {
      default: `max(0px, calc(var(--_dropdown-menu-radius-start-start, var(--_dropdown-menu-radius-top-left, var(--_dropdown-menu-radius, ${spacingVars['--spacing-2']}))) - var(--_dropdown-menu-padding, ${spacingVars['--spacing-1']})))`,
      ':dir(rtl)': `max(0px, calc(var(--_dropdown-menu-radius-start-start, var(--_dropdown-menu-radius-top-right, var(--_dropdown-menu-radius, ${spacingVars['--spacing-2']}))) - var(--_dropdown-menu-padding, ${spacingVars['--spacing-1']})))`,
    },
    borderStartEndRadius: {
      default: `max(0px, calc(var(--_dropdown-menu-radius-start-end, var(--_dropdown-menu-radius-top-right, var(--_dropdown-menu-radius, ${spacingVars['--spacing-2']}))) - var(--_dropdown-menu-padding, ${spacingVars['--spacing-1']})))`,
      ':dir(rtl)': `max(0px, calc(var(--_dropdown-menu-radius-start-end, var(--_dropdown-menu-radius-top-left, var(--_dropdown-menu-radius, ${spacingVars['--spacing-2']}))) - var(--_dropdown-menu-padding, ${spacingVars['--spacing-1']})))`,
    },
    borderEndStartRadius: {
      default: `max(0px, calc(var(--_dropdown-menu-radius-end-start, var(--_dropdown-menu-radius-bottom-left, var(--_dropdown-menu-radius, ${spacingVars['--spacing-2']}))) - var(--_dropdown-menu-padding, ${spacingVars['--spacing-1']})))`,
      ':dir(rtl)': `max(0px, calc(var(--_dropdown-menu-radius-end-start, var(--_dropdown-menu-radius-bottom-right, var(--_dropdown-menu-radius, ${spacingVars['--spacing-2']}))) - var(--_dropdown-menu-padding, ${spacingVars['--spacing-1']})))`,
    },
    borderEndEndRadius: {
      default: `max(0px, calc(var(--_dropdown-menu-radius-end-end, var(--_dropdown-menu-radius-bottom-right, var(--_dropdown-menu-radius, ${spacingVars['--spacing-2']}))) - var(--_dropdown-menu-padding, ${spacingVars['--spacing-1']})))`,
      ':dir(rtl)': `max(0px, calc(var(--_dropdown-menu-radius-end-end, var(--_dropdown-menu-radius-bottom-left, var(--_dropdown-menu-radius, ${spacingVars['--spacing-2']}))) - var(--_dropdown-menu-padding, ${spacingVars['--spacing-1']})))`,
    },
  },
});
