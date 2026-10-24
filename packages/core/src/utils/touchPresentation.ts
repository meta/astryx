// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file touchPresentation.ts
 * @input Uses the SSR-safe useMediaQuery hook and window.matchMedia
 * @output The one definition of when a component presents itself the touch
 *   (UIKit) way: TOUCH_QUERY, COMPACT_QUERY, COMPACT_TOUCH_QUERY, the iOS
 *   gate (IOS_SUPPORTS_QUERY and its StyleX keys); the hooks
 *   useTouchPresentation, useTouchIdiom and useMotionPresentation;
 *   readTouchPresentation for a decision taken at one moment
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
 * - The IDIOM: `ios` where iOS's own look and motion belong (UIKit's springs
 *   and timings, rubber band, glass, wheels, edge swipe-back), `default`
 *   everywhere else, Android included, which keeps today's behaviour until a
 *   Material variant exists. iOS is WebKit on iOS or iPadOS under a coarse
 *   pointer: `-webkit-touch-callout` exists in no other engine, so every iOS
 *   browser matches and Android Chrome and desktop Safari do not.
 *
 * A component with no interaction to infer from (a spinner, a progress bar)
 * reads the idiom to choose its timing: UIKit's on iOS, the theme's duration
 * and easing tokens otherwise (`useMotionPresentation`).
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
 * every touch-callout key spelled and nested as above. The keys are literal
 * because the Astryx StyleX build does not resolve a key shared across files
 * through `defineConsts`. The hooks are for behaviour. They answer the
 * server default (not touch, not compact, `default`) until hydrated unless
 * the caller passes a server hint, and follow the pointer and size when they
 * change (a tablet docking a mouse); the engine part of the idiom never
 * changes.
 *
 * SYNC: When modified, update touchPresentation.test.ts and every StyleX
 * media key that spells these queries.
 */

import {useMemo, useSyncExternalStore} from 'react';
import {useMediaQuery} from '../hooks/useMediaQuery';

/** The primary pointer is coarse: touch behaviours and UIKit motion. */
export const TOUCH_QUERY = '(pointer: coarse)';

/** The viewport is compact: layout behaviours. */
export const COMPACT_QUERY = '(width < 744px), (height < 500px)';

/** Both: presentations such as a sheet in place of a popover. */
export const COMPACT_TOUCH_QUERY =
  '(width < 744px) and (pointer: coarse), (height < 500px) and (pointer: coarse)';

/**
 * The engine is WebKit on iOS or iPadOS: the only one that implements
 * `-webkit-touch-callout`. With TOUCH_QUERY, the iOS idiom.
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

/** Whose idiom a touch presentation follows: iOS's, or today's Astryx. */
export type TouchIdiom = 'ios' | 'default';

export interface TouchPresentation {
  /** The primary pointer is coarse (a finger). */
  readonly isTouch: boolean;
  /** The viewport is compact. */
  readonly isCompact: boolean;
  /** Both. */
  readonly isCompactTouch: boolean;
  /** `ios` for WebKit on iOS or iPadOS under a finger, `default` otherwise. */
  readonly idiom: TouchIdiom;
}

/** Which motion a presentation runs: UIKit's table or the theme's tokens. */
export type MotionPresentation = 'uikit' | 'theme';

/** Whether this engine is WebKit on iOS or iPadOS. */
function isIosWebKit(
  // `CSS` is a property of the window object but not of TypeScript's Window.
  view: (Window & {CSS?: Partial<typeof CSS>}) | null,
): boolean {
  const css = view?.CSS;
  return (
    typeof css?.supports === 'function' && css.supports(IOS_SUPPORTS_QUERY)
  );
}

const subscribeNever = () => () => {};

/** The engine part of the idiom: fixed for a page, the server's until hydrated. */
function useIsIosWebKit(serverDefault: boolean): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => isIosWebKit(typeof window === 'undefined' ? null : window),
    () => serverDefault,
  );
}

/**
 * The idiom now: `ios` for WebKit on iOS or iPadOS under a coarse pointer,
 * `default` otherwise. SSR-safe: renders `serverDefault` until hydrated.
 */
export function useTouchIdiom(
  serverDefault: TouchIdiom = 'default',
): TouchIdiom {
  const isIos = serverDefault === 'ios';
  const isTouch = useMediaQuery(TOUCH_QUERY, isIos);
  return useIsIosWebKit(isIos) && isTouch ? 'ios' : 'default';
}

/**
 * The touch presentation now. SSR-safe: hooks render the server default and
 * update after hydration.
 */
export function useTouchPresentation(
  serverDefault: Partial<Omit<TouchPresentation, 'isCompactTouch'>> = {},
): TouchPresentation {
  const isIosHint = serverDefault.idiom === 'ios';
  const isTouch = useMediaQuery(
    TOUCH_QUERY,
    serverDefault.isTouch ?? isIosHint,
  );
  const isCompact = useMediaQuery(
    COMPACT_QUERY,
    serverDefault.isCompact ?? false,
  );
  const isIos = useIsIosWebKit(isIosHint) && isTouch;
  return useMemo(
    () => ({
      isTouch,
      isCompact,
      isCompactTouch: isTouch && isCompact,
      idiom: isIos ? 'ios' : 'default',
    }),
    [isTouch, isCompact, isIos],
  );
}

/**
 * The motion a presentation runs (D-01): UIKit's springs and timings in the
 * iOS idiom, the theme's duration and easing tokens everywhere else (a mouse,
 * and a finger outside iOS). `serverDefault`: render as iOS before hydration.
 */
export function useMotionPresentation(
  serverDefault = false,
): MotionPresentation {
  return useTouchIdiom(serverDefault ? 'ios' : 'default') === 'ios'
    ? 'uikit'
    : 'theme';
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
    return {
      isTouch: false,
      isCompact: false,
      isCompactTouch: false,
      idiom: 'default',
    };
  }
  const isTouch = view.matchMedia(TOUCH_QUERY).matches;
  const isCompact = view.matchMedia(COMPACT_QUERY).matches;
  return {
    isTouch,
    isCompact,
    isCompactTouch: isTouch && isCompact,
    idiom: isTouch && isIosWebKit(view) ? 'ios' : 'default',
  };
}
