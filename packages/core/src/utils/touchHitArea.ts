// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file touchHitArea.ts
 * @input An element ref and whether the element takes taps, the shared touch
 *   hit area (utils/hitArea.ts), the theme's touch target size
 *   (`--size-touch-target`), and the Web Animations running around the
 *   element
 * @output Exports `useTouchHitArea`, which keeps an element's hit insets live
 *   for its invisible layer (`touchHitAreaStyles.layer`,
 *   utils/touchHitArea.stylex.ts), and `touchTargetSize`
 * @position Core-internal hook for the coarse-only 44 px target
 *   (`spec:AST-094` FR43): List rows (ListItem) use it, and so can any
 *   control whose target grows under a finger without growing its box
 *
 * Under a coarse primary pointer the shared utility measures how far the
 * element's hit target may grow toward the touch target without reaching a
 * neighbor's half of the gap, and this writes those insets on the element,
 * where its layer reads them. Under a fine pointer the shared utility starts
 * no observer and writes nothing.
 *
 * Elements move by transform (a list row in an update's slide, a swipe, edit
 * mode's slide, or its neighbors sliding past it), and the shared measurement
 * reads them as they stand in one frame. A measurement that arrives while the
 * element's parent has a finite animation running or held is dropped, and
 * once those animations end the element is watched afresh, so its insets are
 * taken at rest and no frame of a compositor-only motion lays out or paints
 * for them.
 *
 * SYNC: When modified, update utils/touchHitArea.stylex.ts and
 * touchHitArea.test.tsx.
 */

import {useEffect, type RefObject} from 'react';
import {MIN_TOUCH_TARGET, watchHitArea, writeHitInsets} from './hitArea';

/**
 * The theme's touch target size in px (`--size-touch-target`), read under a
 * finger only; the 44 px minimum otherwise.
 */
export function touchTargetSize(element: Element): number {
  const view = element.ownerDocument.defaultView;
  if (view?.matchMedia?.('(pointer: coarse)').matches !== true) {
    return MIN_TOUCH_TARGET;
  }
  const value = view
    .getComputedStyle(element)
    .getPropertyValue('--size-touch-target')
    .trim();
  const size = value.endsWith('px') ? Number.parseFloat(value) : Number.NaN;
  return Number.isFinite(size) && size > 0 ? size : MIN_TOUCH_TARGET;
}

/**
 * The finite animations running or held in the element's parent, the element
 * included: a row's own motion and its neighbors'. An endless one (a spinner)
 * moves nothing that comes to rest, so it holds nothing.
 */
function settlingAnimations(element: HTMLElement): Animation[] {
  const scope = element.parentElement ?? element;
  if (typeof scope.getAnimations !== 'function') {
    return [];
  }
  return scope.getAnimations({subtree: true}).filter(animation => {
    if (animation.playState !== 'running' && animation.playState !== 'paused') {
      return false;
    }
    const end = animation.effect?.getComputedTiming().endTime;
    return typeof end === 'number' && Number.isFinite(end);
  });
}

/** Watches `element`, taking its insets only at rest; returns the stop. */
function watchAtRest(element: HTMLElement, minSize: number): () => void {
  let stop = (): void => {};
  let isStopped = false;
  let isWaiting = false;
  const watch = (): void => {
    stop = watchHitArea(
      element,
      insets => {
        const moving = settlingAnimations(element);
        if (moving.length === 0) {
          writeHitInsets(element, insets);
          return;
        }
        if (isWaiting) {
          return;
        }
        isWaiting = true;
        void Promise.allSettled(
          moving.map(async animation => animation.finished),
        ).then(() => {
          isWaiting = false;
          if (!isStopped) {
            stop();
            watch();
          }
        });
      },
      {minSize},
    );
  };
  watch();
  return () => {
    isStopped = true;
    stop();
  };
}

/**
 * Keeps `ref`'s element's hit insets live while `enabled` (the element takes
 * taps: interactive, not disabled or read-only). Pair it with
 * `touchHitAreaStyles.layer` on the same element.
 *
 * @example
 * ```
 * const ref = useRef<HTMLLIElement | null>(null);
 * useTouchHitArea(ref, isInteractive && !isDisabled);
 * <li ref={ref} {...stylex.props(isInteractive && touchHitAreaStyles.layer)} />
 * ```
 */
export function useTouchHitArea(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
): void {
  // External system (`architecture:react-component-runtime` INV3): the shared
  // touch hit area (utils/hitArea.ts), which measures the element against its
  // neighbors and writes its insets on it; the cleanup stops the watch.
  useEffect(() => {
    const element = ref.current;
    if (!enabled || element == null) {
      return undefined;
    }
    return watchAtRest(element, touchTargetSize(element));
  }, [enabled, ref]);
}
