// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file menuRowCorners.stylex.ts
 * @input The menu's radius and padding variables
 * @output Exports menuRowCornerStyles: a menu row's corners, each the menu's
 *   corner less the menu's padding, never below 0
 * @position Shared by DropdownMenu's item, checkbox item and radio item (and
 *   so the context menu, which renders them)
 *
 * Each corner follows the menu corner it sits inside: a theme that gives the
 * menu corners of different radii (a corner variable the theme pipeline
 * writes for each) gives the rows the same shape. A logical corner is read
 * first, else the physical corner it is in this direction, else the menu's
 * one radius.
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
