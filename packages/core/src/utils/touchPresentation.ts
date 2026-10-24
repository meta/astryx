// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file touchPresentation.ts
 * @input Uses the SSR-safe useMediaQuery hook and window.matchMedia
 * @output The one definition of when a component presents itself the touch
 *   way: TOUCH_QUERY, COMPACT_QUERY, COMPACT_TOUCH_QUERY, the iOS style gate
 *   (IOS_SUPPORTS_QUERY and its StyleX keys); the hook useTouchPresentation;
 *   readTouchPresentation for a decision taken at one moment
 * @position Internal shared resolver beside interactionModality.ts
 *
 * Two questions, answered once:
 *
 * - TOUCH behaviours (the press model, gesture recognizers, UIKit springs and
 *   timings) key on the PRIMARY pointer being coarse: a finger. A touchscreen
 *   laptop reports its trackpad (fine) and keeps pointer behaviours; a tablet
 *   reports coarse and gets touch ones at any width. Not `hover: none` (some
 *   touch browsers report hover) and not `any-pointer` (a laptop's touch
 *   screen is not how it is driven).
 * - LAYOUT behaviours key on the available size, whatever the pointer:
 *   the theme's one compact definition (`spec:AST-012` FR9), width below the
 *   `md` point or height below 500, the same numbers on every platform. A
 *   phone in landscape is compact by its height; no platform size class is
 *   consulted.
 * - A presentation that needs both (a bottom sheet in place of a popover, a
 *   drilled-in sub-menu in place of a flyout) asks for both.
 *
 * Touch behaviour is one model on every touch device, iOS and Android alike;
 * nothing here chooses a platform. Touch motion reads the theme's motion
 * roles, whose defaults are the measured table.
 *
 * CSS first: a style that changes with these conditions writes the same
 * query as a StyleX media key, spelled exactly as here (`@media` followed by
 * the constant's text), so the right rule paints before hydration. The iOS
 * gate is two nested keys, the media query outside and the supports query
 * inside (IOS_TOUCH_STYLE_KEYS):
 *
 *   '@media (pointer: coarse)': {
 *     '@supports (-webkit-touch-callout: none)': value,
 *   },
 *
 * One `@supports (-webkit-touch-callout: none) and (pointer: coarse)` never
 * matches anywhere (`pointer` is not a property), so it is not written. A
 * test keeps core's compact-touch keys identical to COMPACT_TOUCH_QUERY and
 * every touch-callout key spelled and nested as above. The iOS style gate
 * is only for a style iOS WebKit itself requires (core's 16px input floor);
 * it never selects a behaviour. The keys are literal because the Astryx
 * StyleX build does not resolve a key shared across files through
 * `defineConsts`. The hook is for behaviour. It answers the server default
 * (not touch, not compact) until hydrated unless the caller passes a server
 * hint, and follows the pointer and size when they change (a tablet docking
 * a mouse).
 *
 * SYNC: When modified, update touchPresentation.test.ts and every StyleX
 * media key that spells these queries.
 */

import {useMemo} from 'react';
import {useMediaQuery} from '../hooks/useMediaQuery';
import {DEFAULT_COMPACT_DEFINITION} from '../theme/themeAdaptations';

/** The primary pointer is coarse: touch behaviours. */
export const TOUCH_QUERY = '(pointer: coarse)';

/** The viewport is compact: layout behaviours (`spec:AST-012` FR9). */
export const COMPACT_QUERY = DEFAULT_COMPACT_DEFINITION.query;

/** Both: presentations such as a sheet in place of a popover. */
export const COMPACT_TOUCH_QUERY =
  DEFAULT_COMPACT_DEFINITION.coarsePointerQuery;

/**
 * The engine is WebKit on iOS or iPadOS: the only one that implements
 * `-webkit-touch-callout`. For a style iOS WebKit requires, never a
 * behaviour.
 */
export const IOS_SUPPORTS_QUERY = '(-webkit-touch-callout: none)';

/**
 * The iOS gate as StyleX keys, nested in this order: the media query
 * outside, the supports query inside.
 */
export const IOS_TOUCH_STYLE_KEYS = [
  `@media ${TOUCH_QUERY}`,
  `@supports ${IOS_SUPPORTS_QUERY}`,
] as const;

/**
 * Whether a component presents itself the touch way, and where.
 * @experimental
 */
export interface TouchPresentation {
  /** The primary pointer is coarse (a finger). */
  readonly isTouch: boolean;
  /** The viewport is compact. */
  readonly isCompact: boolean;
  /** Both. */
  readonly isCompactTouch: boolean;
}

/**
 * The touch presentation now. SSR-safe: hooks render the server default and
 * update after hydration.
 * @experimental
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
 * The touch presentation at this moment, for a decision taken once (a menu
 * deciding how it presents as it opens). Not touch and not compact where
 * there is no window.
 * @experimental
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
