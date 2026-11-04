// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file touchHitArea.ts
 * @input Whether an element takes taps, the shared touch hit area
 *   (utils/hitArea.ts) and the Web Animations around the element
 * @output `useTouchHitArea`, a callback ref that keeps an element's hit insets
 *   live for its invisible layer (`touchHitAreaStyles.layer`)
 * @position Core-internal hook for the coarse-only 44 px target. List rows and
 *   InfoTip use it, and so can any control whose target grows under a finger
 *   without growing its box.
 *
 * SYNC: When modified, update utils/touchHitArea.stylex.ts and
 * touchHitArea.test.tsx.
 */

import {useCallback, type RefCallback} from 'react';
import {
  MIN_TOUCH_TARGET,
  NO_HIT_INSETS,
  watchHitArea,
  writeHitInsets,
} from './hitArea';

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

/**
 * Watches `element` and takes its insets only at rest. Returns the stop.
 *
 * Under a coarse primary pointer, the shared utility measures how far the
 * element's hit target may grow without reaching a neighbor's half of the
 * gap. This writes those insets on the element, where its layer reads them.
 * Under a fine pointer the shared utility starts no observer.
 *
 * Elements move by transform: a list row in an update's slide, a swipe, or
 * neighbors that slide past. The shared measurement reads them as they stand
 * in one frame. So a measurement that arrives while the parent has a finite
 * animation running or held is dropped. When those animations end, the
 * element is watched again. The insets are then taken at rest, and no frame
 * of a compositor-only motion lays out or paints for them.
 */
function watchAtRest(element: HTMLElement, minSize: number): () => void {
  let stopWatch = (): void => {};
  let isStopped = false;
  let isWaiting = false;
  // A stopped watch clears the insets it wrote. A fresh watch skips a
  // measurement equal to its start, zero, so old insets would otherwise stay.
  const stop = (): void => {
    stopWatch();
    writeHitInsets(element, NO_HIT_INSETS);
  };
  const watch = (): void => {
    stopWatch = watchHitArea(
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
      // The layer is the host's own `::after`, so a touch on the host's
      // content is the host's, even where that content paints past its box.
      {minSize, ownsDescendantTouches: true},
    );
  };
  watch();
  return () => {
    isStopped = true;
    stop();
  };
}

/**
 * A callback ref that keeps its element's hit insets live while `enabled`:
 * the element takes taps, so it is interactive and not disabled or read-only.
 * Merge it into the element's ref, and pair it with `touchHitAreaStyles.layer`
 * on the same element. The watch lasts while the element is attached, so a
 * replaced element starts its own.
 *
 * @example
 * ```
 * const hitAreaRef = useTouchHitArea(isInteractive && !isDisabled);
 * <li ref={hitAreaRef} {...stylex.props(isInteractive && touchHitAreaStyles.layer)} />
 * ```
 */
export function useTouchHitArea(enabled: boolean): RefCallback<HTMLElement> {
  // Syncs with an external system: the shared touch hit area
  // (utils/hitArea.ts) measures the element against its neighbors and writes
  // its insets on it. The ref's cleanup stops the watch.
  return useCallback(
    (element: HTMLElement | null) => {
      if (!enabled || element == null) {
        return undefined;
      }
      return watchAtRest(element, MIN_TOUCH_TARGET);
    },
    [enabled],
  );
}
