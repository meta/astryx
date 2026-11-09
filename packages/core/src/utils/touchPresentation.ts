// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file touchPresentation.ts
 * @input useMediaQuery, window.matchMedia, and TOUCH_QUERY from touchQueries.ts
 * @output TOUCH_QUERY, COMPACT_QUERY, COMPACT_TOUCH_QUERY, the iOS style gate
 *   (IOS_SUPPORTS_QUERY and its StyleX keys), useTouchPresentation, and
 *   readTouchPresentation
 * @position Internal shared resolver beside interactionModality.ts; the one
 *   definition of when a component presents itself the touch way
 *
 * SYNC: When modified, update touchPresentation.test.ts and every StyleX
 * media key that spells these queries.
 */

// - Touch behaviors key on a coarse primary pointer: a finger. A touchscreen
//   laptop reports its trackpad and keeps pointer behaviors. Not
//   `hover: none` (some touch browsers report hover), and not `any-pointer`.
// - Layout behaviors key on the available size: the theme's compact
//   definition (AST-012, and its AST-012 FR9). A phone in landscape is
//   compact by its height.
// - A presentation that needs both asks for both. No platform is chosen.
//
// A style that changes with these conditions uses the same query as a StyleX
// media key, so the right rule paints before hydration. The iOS gate is two
// nested keys, the media query outside and the supports query inside:
//
//   '@media (pointer: coarse)': {
//     '@supports (-webkit-touch-callout: none)': value,
//   },
//
// One combined `@supports` never matches, because `pointer` is not a
// property. The iOS gate is only for a style that iOS WebKit requires (the
// 16px input floor). Core spells the keys literally, because an imported
// `defineConsts` key gets a different StyleX priority. Tests keep the
// literals equal to these queries and to `touchKeys`. The hook answers the
// server default until hydrated, unless the caller passes a hint.

import {useMemo} from 'react';
import {useMediaQuery} from '../hooks/useMediaQuery';
import {
  DEFAULT_COMPACT_DEFINITION,
  compactDefinition,
  type CompactDefinition,
} from '../theme/themeAdaptations';
import {useThemeDefinition} from '../theme/useTheme';
import {IOS_SUPPORTS_QUERY, TOUCH_QUERY} from './touchQueries';

// The primary pointer is coarse: touch behaviours. Defined in touchQueries.ts,
// which loads without React or the theme.
export {TOUCH_QUERY};

/**
 * The viewport is compact at the default width points: layout behaviours.
 * A StyleX media key, which cannot read the theme,
 * spells this; behaviour reads the active theme's definition
 * (useCompactDefinition), so a theme that moves `md` moves compact with it.
 */
export const COMPACT_QUERY = DEFAULT_COMPACT_DEFINITION.query;

/** Both, at the default width points: a sheet in place of a popover. */
export const COMPACT_TOUCH_QUERY =
  DEFAULT_COMPACT_DEFINITION.coarsePointerQuery;

// The engine is WebKit on iOS or iPadOS, for a style iOS WebKit requires.
// Defined in touchQueries.ts, which loads without React or the theme.
export {IOS_SUPPORTS_QUERY};

/**
 * The iOS gate as StyleX keys, nested in this order: the media query
 * outside, the supports query inside.
 */
export const IOS_TOUCH_STYLE_KEYS = [
  `@media ${TOUCH_QUERY}`,
  `@supports ${IOS_SUPPORTS_QUERY}`,
] as const;

export interface TouchPresentation {
  /** The primary pointer is coarse (a finger). */
  readonly isTouch: boolean;
  /** The viewport is compact. */
  readonly isCompact: boolean;
}

/**
 * The active theme's compact definition: width below the
 * theme's effective `md` point, or height below 500.
 */
export function useCompactDefinition(): CompactDefinition {
  const points = useThemeDefinition()?.__adaptations?.widthBreakpoints;
  return useMemo(
    () =>
      points == null ? DEFAULT_COMPACT_DEFINITION : compactDefinition(points),
    [points],
  );
}

/**
 * The touch presentation now. SSR-safe: hooks render the server default and
 * update after hydration.
 */
export function useTouchPresentation(
  serverDefault: Partial<TouchPresentation> = {},
): TouchPresentation {
  const compact = useCompactDefinition();
  const isTouch = useMediaQuery(TOUCH_QUERY, serverDefault.isTouch ?? false);
  const isCompact = useMediaQuery(
    compact.query,
    serverDefault.isCompact ?? false,
  );
  return useMemo(() => ({isTouch, isCompact}), [isTouch, isCompact]);
}

/**
 * The touch presentation at this moment, for a decision taken once (a menu
 * deciding how it presents as it opens). `compact` is the active theme's
 * definition (`useCompactDefinition()`, read while rendering), required so a
 * theme that moves `md` is never ignored. Not touch and
 * not compact where there is no window.
 */
export function readTouchPresentation(
  view: Window | null,
  compact: CompactDefinition,
): TouchPresentation {
  if (view == null || typeof view.matchMedia !== 'function') {
    return {isTouch: false, isCompact: false};
  }
  const isTouch = view.matchMedia(TOUCH_QUERY).matches;
  const isCompact = view.matchMedia(compact.query).matches;
  return {isTouch, isCompact};
}
