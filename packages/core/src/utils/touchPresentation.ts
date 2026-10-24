// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file touchPresentation.ts
 * @input Uses the SSR-safe useMediaQuery hook and window.matchMedia
 * @output The one definition of when a component presents itself the touch
 *   (UIKit) way: TOUCH_QUERY, COMPACT_QUERY, COMPACT_TOUCH_QUERY; the hooks
 *   useTouchPresentation and useMotionPresentation; readTouchPresentation for
 *   a decision taken at one moment
 * @position Internal shared resolver beside interactionModality.ts
 *
 * Three questions, answered once:
 *
 * - TOUCH behaviours (the press model, gesture recognizers, UIKit springs and
 *   timings) key on the PRIMARY pointer being coarse: a finger. A touchscreen
 *   laptop reports its trackpad (fine) and keeps pointer behaviours; a tablet
 *   reports coarse and gets touch ones at any width. Not `hover: none` (some
 *   touch browsers report hover) and not `any-pointer` (a laptop's touch
 *   screen is not how it is driven).
 * - LAYOUT behaviours key on the available size: compact below 744 px of
 *   width or below 500 px of height, whatever the pointer. UIKit decides by
 *   size class, which is not a width (an iPad mini in portrait, 744 pt wide,
 *   is regular; an iPhone in landscape, 852 pt wide, is compact). These two
 *   lines sort both right, and phones in landscape with them; the one known
 *   miss is a Max-size iPhone in landscape (932 x 430 pt), which UIKit calls
 *   regular and this calls compact.
 * - A presentation that needs both (a bottom sheet in place of a popover, a
 *   drilled-in sub-menu in place of a flyout) asks for both.
 *
 * A component with no interaction to infer from (a spinner, a progress bar)
 * reads the touch answer to choose its timing: UIKit's on touch, the theme's
 * duration and easing tokens otherwise (`useMotionPresentation`).
 *
 * CSS first: a style that changes with these conditions writes the same
 * query as a StyleX media key, spelled exactly as here (`@media` followed by
 * the constant's text), so the right rule paints before hydration; a test
 * keeps core's compact-touch keys identical to COMPACT_TOUCH_QUERY. The keys
 * are literal because the Astryx StyleX build does not resolve a media key
 * shared across files through `defineConsts`. The hooks are for behaviour. They answer the server default (not touch,
 * not compact) until hydrated unless the caller passes a server hint, and
 * follow the conditions when they change (a tablet docking a mouse).
 *
 * SYNC: When modified, update touchPresentation.test.ts and every StyleX
 * media key that spells these queries.
 */

import {useMemo} from 'react';
import {useMediaQuery} from '../hooks/useMediaQuery';

/** The primary pointer is coarse: touch behaviours and UIKit motion. */
export const TOUCH_QUERY = '(pointer: coarse)';

/** The viewport is compact: layout behaviours. */
export const COMPACT_QUERY = '(width < 744px), (height < 500px)';

/** Both: presentations such as a sheet in place of a popover. */
export const COMPACT_TOUCH_QUERY =
  '(width < 744px) and (pointer: coarse), (height < 500px) and (pointer: coarse)';

export interface TouchPresentation {
  /** The primary pointer is coarse (a finger). */
  readonly isTouch: boolean;
  /** The viewport is compact. */
  readonly isCompact: boolean;
  /** Both. */
  readonly isCompactTouch: boolean;
}

/** Which motion a presentation runs: UIKit's table or the theme's tokens. */
export type MotionPresentation = 'uikit' | 'theme';

/**
 * The touch presentation now. SSR-safe: hooks render the server default and
 * update after hydration.
 */
export function useTouchPresentation(
  serverDefault: Partial<Omit<TouchPresentation, 'isCompactTouch'>> = {},
): TouchPresentation {
  const isTouch = useMediaQuery(TOUCH_QUERY, serverDefault.isTouch ?? false);
  const isCompact = useMediaQuery(
    COMPACT_QUERY,
    serverDefault.isCompact ?? false,
  );
  return useMemo(
    () => ({isTouch, isCompact, isCompactTouch: isTouch && isCompact}),
    [isTouch, isCompact],
  );
}

/**
 * The motion a presentation runs (D-01): UIKit's springs and timings under a
 * finger, the theme's duration and easing tokens under a mouse.
 */
export function useMotionPresentation(
  serverDefault = false,
): MotionPresentation {
  return useMediaQuery(TOUCH_QUERY, serverDefault) ? 'uikit' : 'theme';
}

/**
 * The touch presentation at this moment, for a decision taken once (a menu
 * deciding how it presents as it opens). Not touch and not compact where
 * there is no window.
 */
export function readTouchPresentation(
  view: Window | null = typeof window === 'undefined' ? null : window,
): TouchPresentation {
  if (view == null || typeof view.matchMedia !== 'function') {
    return {isTouch: false, isCompact: false, isCompactTouch: false};
  }
  const isTouch = view.matchMedia(TOUCH_QUERY).matches;
  const isCompact = view.matchMedia(COMPACT_QUERY).matches;
  return {isTouch, isCompact, isCompactTouch: isTouch && isCompact};
}
