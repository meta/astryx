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
 * bare media key on a base style, so a pinned `'popover'` keeps none of it;
 * touch-only rules inside it stay nested as IOS_TOUCH_STYLE_KEYS spell. On
 * the server `touchModes` is false and `'adaptive'` is the popover (the
 * surfaces open only after hydration), unless a server hint says otherwise.
 *
 * SYNC: When modified, update presentation.test.ts.
 */

import {useMemo} from 'react';
import type {AdaptivePresentation} from '../hooks/useAdaptivePresentation';
import {
  readTouchPresentation,
  useTouchPresentation,
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

export interface UsePresentationOptions extends PresentationOptions {
  /** The touch presentation to assume before hydration (useTouchPresentation's hint). */
  readonly serverDefault?: Partial<Omit<TouchPresentation, 'isCompactTouch'>>;
}

export interface ReadPresentationOptions extends PresentationOptions {
  /** The window to read; the global one by default. */
  readonly view?: Window | null;
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
    (request === 'adaptive' && touch.isCompactTouch)
      ? 'bottom-sheet'
      : 'popover';
  const touchModes = request !== 'popover' && touch.isTouch;
  return {surface, touchModes};
}

/**
 * The presentation now, following the pointer and the size as they change
 * (a tablet docking a trackpad). SSR-safe: renders the server default (not
 * touch, not compact) until hydrated unless `serverDefault` says otherwise.
 */
export function usePresentation(
  presentation: AdaptivePresentation | undefined,
  {whenOmitted = 'popover', serverDefault}: UsePresentationOptions = {},
): ResolvedPresentation {
  const touch = useTouchPresentation(serverDefault);
  return useMemo(
    () => resolvePresentation(presentation, touch, whenOmitted),
    [presentation, touch, whenOmitted],
  );
}

/**
 * The presentation at this moment, for a decision taken once (a menu
 * deciding how it follows the finger that opened it).
 */
export function readPresentation(
  presentation: AdaptivePresentation | undefined,
  {whenOmitted = 'popover', view}: ReadPresentationOptions = {},
): ResolvedPresentation {
  return resolvePresentation(
    presentation,
    readTouchPresentation(view),
    whenOmitted,
  );
}
