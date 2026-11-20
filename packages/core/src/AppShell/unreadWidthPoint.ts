// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file unreadWidthPoint.ts
 * @input The shell's layout state, its side nav breakpoint and the width the
 *   theme gives that breakpoint
 * @output unreadWidthPoint (the standard width point below which a shell that
 *   has not read the window hides its phone-only regions) and UNREAD_STYLES
 *   (the compiled rule for each standard point: the inline side nav, the
 *   elevated corner and the top nav's start and center regions)
 * @position Private to AppShell: its layout before it reads the window, and
 *   the only module that writes the standard width points as media keys.
 *   AppShell computes the point once and hands TopNav its region rule through
 *   TopNavUnreadRegionContext.
 */

import * as stylex from '@stylexjs/stylex';
import {radiusVars} from '../theme/tokens.stylex';
import {
  DEFAULT_WIDTH_BREAKPOINTS,
  type WidthBreakpointName,
} from '../theme/themeAdaptations';

/**
 * The standard width point below which a shell that has not read the window
 * shows its phone layout through CSS, or null. StyleX compiles media queries
 * ahead of time, so only the standard points have a rule: a theme that moves
 * the point keeps the server's layout until the shell reads the window.
 */
export function unreadWidthPoint(
  isUnread: boolean,
  breakpoint: WidthBreakpointName | 'none',
  breakpointWidth: number | null,
): WidthBreakpointName | null {
  return isUnread &&
    breakpoint !== 'none' &&
    breakpointWidth === DEFAULT_WIDTH_BREAKPOINTS[breakpoint]
    ? breakpoint
    : null;
}

// One rule per standard width point (`DEFAULT_WIDTH_BREAKPOINTS`). The
// queries use `not all and (min-width)`: StyleX lowers `(width < N)` to
// `(max-width: N - 0.01)`, which Chromium rounds up to N, so the rule would
// also apply at the point itself. Below the point, the inline side nav does
// not paint, the elevated backdrop loses its corner, and the top nav's start
// and center regions do not paint, as in the phone layout.
const sideNavStyles = stylex.create({
  sm: {
    display: {default: null, '@media not all and (min-width: 640px)': 'none'},
  },
  md: {
    display: {default: null, '@media not all and (min-width: 768px)': 'none'},
  },
  lg: {
    display: {default: null, '@media not all and (min-width: 1024px)': 'none'},
  },
  xl: {
    display: {default: null, '@media not all and (min-width: 1280px)': 'none'},
  },
  '2xl': {
    display: {default: null, '@media not all and (min-width: 1536px)': 'none'},
  },
});
const cornerStyles = stylex.create({
  sm: {
    borderStartStartRadius: {
      default: radiusVars['--radius-page'],
      '@media not all and (min-width: 640px)': 0,
    },
  },
  md: {
    borderStartStartRadius: {
      default: radiusVars['--radius-page'],
      '@media not all and (min-width: 768px)': 0,
    },
  },
  lg: {
    borderStartStartRadius: {
      default: radiusVars['--radius-page'],
      '@media not all and (min-width: 1024px)': 0,
    },
  },
  xl: {
    borderStartStartRadius: {
      default: radiusVars['--radius-page'],
      '@media not all and (min-width: 1280px)': 0,
    },
  },
  '2xl': {
    borderStartStartRadius: {
      default: radiusVars['--radius-page'],
      '@media not all and (min-width: 1536px)': 0,
    },
  },
});
// The regions are flex rows: a StyleX value replaces the whole property, so
// the rule keeps `flex` above the point.
const topNavRegionStyles = stylex.create({
  sm: {
    display: {default: 'flex', '@media not all and (min-width: 640px)': 'none'},
  },
  md: {
    display: {default: 'flex', '@media not all and (min-width: 768px)': 'none'},
  },
  lg: {
    display: {
      default: 'flex',
      '@media not all and (min-width: 1024px)': 'none',
    },
  },
  xl: {
    display: {
      default: 'flex',
      '@media not all and (min-width: 1280px)': 'none',
    },
  },
  '2xl': {
    display: {
      default: 'flex',
      '@media not all and (min-width: 1536px)': 'none',
    },
  },
});

/** The rules for each standard width point. */
export const UNREAD_STYLES: Readonly<
  Record<
    WidthBreakpointName,
    {
      sideNav: stylex.StyleXStyles;
      corner: stylex.StyleXStyles;
      topNavRegion: stylex.StyleXStyles;
    }
  >
> = {
  sm: {
    sideNav: sideNavStyles.sm,
    corner: cornerStyles.sm,
    topNavRegion: topNavRegionStyles.sm,
  },
  md: {
    sideNav: sideNavStyles.md,
    corner: cornerStyles.md,
    topNavRegion: topNavRegionStyles.md,
  },
  lg: {
    sideNav: sideNavStyles.lg,
    corner: cornerStyles.lg,
    topNavRegion: topNavRegionStyles.lg,
  },
  xl: {
    sideNav: sideNavStyles.xl,
    corner: cornerStyles.xl,
    topNavRegion: topNavRegionStyles.xl,
  },
  '2xl': {
    sideNav: sideNavStyles['2xl'],
    corner: cornerStyles['2xl'],
    topNavRegion: topNavRegionStyles['2xl'],
  },
};
