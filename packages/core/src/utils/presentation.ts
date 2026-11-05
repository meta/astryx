// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file presentation.ts
 * @input A component's `presentation` prop, what the component does when it
 *   is omitted, and the touch presentation (utils/touchPresentation.ts)
 * @output usePresentation, readPresentation, and the pure
 *   resolvePresentation: the surface to render and whether the component's
 *   touch input modes apply
 * @position Internal resolver for stable components that, under a finger,
 *   present a different surface or change how an open surface follows input
 *
 * SYNC: When modified, update presentation.test.ts.
 */

// A caller's explicit `presentation` always wins over the touch default:
// - `'popover'`: the fine-pointer surface and input modes, on every device.
// - `'bottom-sheet'`: the sheet everywhere, with touch input modes under a
//   finger.
// - `'adaptive'`: the sheet on a compact touch screen (AST-012), else the
//   popover, with touch input modes under a finger.
// - Omitted: `whenOmitted: 'popover'` answers as `'popover'`.
//   `whenOmitted: 'touch'` keeps the popover surface and turns on touch input
//   modes under a finger. When a released component changes its default to
//   `'touch'`, that is a functional default change (AST-017).
//
// The modes depend on the pointer, never the platform. Touch styling and
// touch-only behavior from a component's own record do not read this.
//
// Apply a touch-mode style with `touchModes`
// (`stylex.props(touchModes && styles.touchMode)`), never as a bare media
// key, so a pinned `'popover'` keeps none of it. On the server and while
// hydrating, `touchModes` is false and `'adaptive'` is the popover
// (AST-094). usePresentation listens only to the queries a request reads.

import {useCallback, useMemo, useSyncExternalStore} from 'react';
import type {AdaptivePresentation} from '../hooks/useAdaptivePresentation';
import type {CompactDefinition} from '../theme/themeAdaptations';
import {
  readTouchPresentation,
  TOUCH_QUERY,
  useCompactDefinition,
  type TouchPresentation,
} from './touchPresentation';

/** What a component does when the caller omits `presentation`. */
export type PresentationDefault = 'popover' | 'touch';

export interface ResolvedPresentation {
  /** The surface to render. */
  readonly surface: 'popover' | 'bottom-sheet';
  /**
   * The component's touch input modes apply: a finger, and `presentation`
   * not pinned to `'popover'`.
   */
  readonly touchModes: boolean;
}

export interface PresentationOptions {
  /** What an omitted `presentation` means. @default 'popover' */
  readonly whenOmitted?: PresentationDefault;
}

/**
 * usePresentation's options. There is no server hint: the server and
 * hydrating render never present touch modes.
 */
export type UsePresentationOptions = PresentationOptions;

export interface ReadPresentationOptions extends PresentationOptions {
  /** The window to read; the global one by default. */
  readonly view?: Window | null;
  /**
   * The active theme's compact definition (`useCompactDefinition()`, read
   * while rendering), so a theme that moves `md` moves the sheet too.
   */
  readonly compact: CompactDefinition;
}

/** The decision, from a presentation request and a touch presentation. */
export function resolvePresentation(
  presentation: AdaptivePresentation | undefined,
  touch: TouchPresentation,
  whenOmitted: PresentationDefault = 'popover',
): ResolvedPresentation {
  const request = presentation ?? whenOmitted;
  const surface =
    request === 'bottom-sheet' ||
    (request === 'adaptive' && touch.isTouch && touch.isCompact)
      ? 'bottom-sheet'
      : 'popover';
  const touchModes = request !== 'popover' && touch.isTouch;
  return {surface, touchModes};
}

const noSubscription = () => () => {};
/** The server and hydrating render match no query. */
const matchesNothing = () => false;

/**
 * A media query's match, subscribed only while `query` is given. False on
 * the server and while hydrating.
 */
function useMatchWhileRead(query: string | null): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (query == null) {
        return noSubscription();
      }
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onStoreChange);
      return () => mql.removeEventListener('change', onStoreChange);
    },
    [query],
  );
  const getSnapshot = useCallback(
    () => query != null && window.matchMedia(query).matches,
    [query],
  );
  return useSyncExternalStore(subscribe, getSnapshot, matchesNothing);
}

/**
 * The presentation now, following the pointer and the size as they change
 * (a tablet docking a trackpad). SSR-safe: renders the server default (not
 * touch, not compact) until hydrated. It subscribes
 * only to what the request reads: a pinned `'popover'` to neither query,
 * `'bottom-sheet'` and the omitted `'touch'` default to the pointer, and
 * `'adaptive'` to the pointer and the compact size.
 */
export function usePresentation(
  presentation: AdaptivePresentation | undefined,
  {whenOmitted = 'popover'}: UsePresentationOptions = {},
): ResolvedPresentation {
  const request = presentation ?? whenOmitted;
  const compact = useCompactDefinition();
  const isTouch = useMatchWhileRead(request === 'popover' ? null : TOUCH_QUERY);
  const isCompact = useMatchWhileRead(
    request === 'adaptive' ? compact.query : null,
  );
  return useMemo(
    () => resolvePresentation(presentation, {isTouch, isCompact}, whenOmitted),
    [presentation, isTouch, isCompact, whenOmitted],
  );
}

/**
 * The presentation at this moment, for a decision taken once (a menu
 * deciding how it follows the finger that opened it).
 */
export function readPresentation(
  presentation: AdaptivePresentation | undefined,
  {whenOmitted = 'popover', view, compact}: ReadPresentationOptions,
): ResolvedPresentation {
  const target =
    view === undefined ? (typeof window === 'undefined' ? null : window) : view;
  return resolvePresentation(
    presentation,
    readTouchPresentation(target, compact),
    whenOmitted,
  );
}
