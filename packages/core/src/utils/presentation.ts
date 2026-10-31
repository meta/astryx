// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file presentation.ts
 * @input A component's `presentation` prop (a caller's value, or omitted),
 *   what the component does when it is omitted, and the touch presentation
 *   (utils/touchPresentation.ts)
 * @output usePresentation and readPresentation (and the pure
 *   resolvePresentation): the surface to render and whether the component's
 *   touch input modes apply
 * @position Internal resolver for stable components that, under a finger,
 *   present a different surface or switch how an open surface follows input
 *   (architecture:public-component-api INV16)
 *
 * A caller's explicit `presentation` always wins over the touch default:
 *
 * - `'popover'`: the fine-pointer surface AND input modes, on every device;
 * - `'bottom-sheet'`: the sheet everywhere, with touch input modes under a
 *   finger;
 * - `'adaptive'`: the sheet on a compact touch screen and the popover
 *   elsewhere, with touch input modes under a finger;
 * - omitted: the component's default. `whenOmitted: 'popover'` answers as
 *   `'popover'` (today's components). `whenOmitted: 'touch'` keeps the
 *   popover surface and turns the component's touch input modes on under a
 *   finger, as UIMenu tracks a finger in an anchored menu. Making `'touch'`
 *   a released component's default is a functional default change
 *   (`spec:AST-017` FR3) whose Changeset names `presentation="popover"`.
 *
 * One touch model on every touch device: the modes depend on the pointer,
 * never on the platform. Touch styling (press paint, the text-size floor)
 * and touch-only behavior that a component's own record defines (a row
 * swipe, a slider's thumb) do not read this: they keep the touch
 * presentation.
 *
 * CSS: a style that implements a touch surface or input mode is applied with
 * `touchModes` (`stylex.props(touchModes && styles.touchMode)`), never as a
 * bare media key on a base style, so a pinned `'popover'` keeps none of it.
 * A rule inside it that needs the touch query uses the touch presentation's
 * touch key; the iOS `@supports` gate is only for the one style iOS WebKit
 * itself requires (the 16px text-size floor), never for a touch mode. On the
 * server and while hydrating, `touchModes` is false and `'adaptive'` is the
 * popover: a touch surface or mode opens only after hydration
 * (`spec:AST-094` FR13), and no hint changes that. usePresentation listens
 * only to the queries a request reads (`architecture:react-component-runtime`
 * INV5): none for a pinned `'popover'`.
 *
 * SYNC: When modified, update presentation.test.ts.
 */

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
 * hydrating render never present touch modes (`spec:AST-094` FR13).
 */
export type UsePresentationOptions = PresentationOptions;

export interface ReadPresentationOptions extends PresentationOptions {
  /** The window to read; the global one by default. */
  readonly view?: Window | null;
  /**
   * The active theme's compact definition (`useCompactDefinition()`, read
   * while rendering), so a theme that moves `md` moves the sheet too
   * (`spec:AST-012` FR9).
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
/** The server and hydrating render match no query (`spec:AST-094` FR13). */
const matchesNothing = () => false;

/**
 * A media query's match, subscribed only while `query` is given
 * (`architecture:react-component-runtime` INV5); false on the server and
 * while hydrating (`spec:AST-094` FR13).
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
 * touch, not compact) until hydrated (`spec:AST-094` FR13). It subscribes
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
