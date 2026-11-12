// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file touchHitArea.ts
 * @input Whether an element takes taps, how it grows, the shared touch hit
 *   area (utils/hitArea.ts) and the Web Animations around the element
 * @output `useTouchHitArea`, a callback ref that keeps an element's hit insets
 *   live for its invisible layer (`touchHitAreaStyles.layer`)
 * @position Core-internal hook for the coarse-only 44 px target. List rows,
 *   InfoTip, CheckboxInput, RadioListItem, SegmentedControl segments and the
 *   press-tracking groups use it, and so can any control whose target outgrows
 *   its box under a finger.
 *
 * SYNC: When modified, update internal/touchHitArea.stylex.ts and
 * touchHitArea.test.tsx.
 */

import {useCallback, type RefCallback} from 'react';
import {
  MIN_TOUCH_TARGET,
  NO_HIT_INSETS,
  settlingAnimations,
  watchHitArea,
  whenSettled,
  writeHitInsets,
  type HitInsets,
  type HitRect,
} from './hitArea';

/** How an owner's element grows, for an owner with its own rule. */
export interface TouchHitAreaOptions {
  /**
   * How far the element grows on each side before any neighbour stops it,
   * read as `watchHitArea`'s `growth`. It also gets the element. A group
   * passes `groupGrowth` of its members.
   * @default toward 44 px on each axis, centered
   */
  readonly growth?: (
    target: HitRect,
    toLayout: (rect: HitRect) => HitRect,
    element: HTMLElement,
  ) => HitInsets;
  /**
   * Whether a finger's press on the element re-measures it against every
   * interactive element on the page. An owner that reads its own targets
   * when a press begins turns it off.
   * @default true
   */
  readonly checkAtPress?: boolean;
  /**
   * Whether a finger's press that lands on a descendant is the element's,
   * however near a neighbour is, read as `watchHitArea`'s
   * `ownsDescendantTouches`. An owner that draws the band on a descendant,
   * and whose content never paints past its box, turns it off, so a band
   * press nearer a neighbour is not the element's.
   * @default true
   */
  readonly ownsDescendantTouches?: boolean;
}

const NO_OPTIONS: TouchHitAreaOptions = {};

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
function watchAtRest(
  element: HTMLElement,
  minSize: number,
  {growth, checkAtPress, ownsDescendantTouches = true}: TouchHitAreaOptions,
): () => void {
  let stopWatch = (): void => {};
  let isStopped = false;
  let isWaiting = false;
  let hasWritten = false;
  // A stopped watch clears the insets it wrote. A fresh watch skips a
  // measurement equal to its start, zero, so old insets would otherwise stay.
  // A watch that wrote nothing, as under a mouse, writes nothing.
  const stop = (): void => {
    stopWatch();
    if (hasWritten) {
      hasWritten = false;
      writeHitInsets(element, NO_HIT_INSETS);
    }
  };
  const watch = (): void => {
    stopWatch = watchHitArea(
      element,
      insets => {
        // The finite animations in the element's parent, the element
        // included: a row's own motion and its neighbors'.
        const moving = settlingAnimations(element.parentElement ?? element);
        if (moving.length === 0) {
          hasWritten = true;
          writeHitInsets(element, insets);
          return;
        }
        if (isWaiting) {
          return;
        }
        isWaiting = true;
        whenSettled(moving, () => {
          isWaiting = false;
          if (!isStopped) {
            stop();
            watch();
          }
        });
      },
      // By default the layer is the host's own `::after`, so a touch on the
      // host's content is the host's, even where that content paints past
      // its box.
      {
        minSize,
        ownsDescendantTouches,
        growth:
          growth == null
            ? undefined
            : (target, toLayout) => growth(target, toLayout, element),
        checkAtPress,
      },
    );
  };
  watch();
  return () => {
    isStopped = true;
    stop();
  };
}

/** The watch on an element, and how many attached refs hold it. */
interface HeldWatch {
  readonly stop: () => void;
  holders: number;
}

const heldWatches = new WeakMap<HTMLElement, HeldWatch>();

/**
 * Holds the element's watch, and starts it on the first hold. Returns the
 * release. A ref that changes, such as a merge with a caller's inline ref,
 * detaches and attaches again in one commit. So the last release waits a
 * microtask, and an attach in between keeps the watch and its insets.
 */
function holdWatch(
  element: HTMLElement,
  options: TouchHitAreaOptions,
): () => void {
  let held = heldWatches.get(element);
  if (held == null) {
    held = {
      stop: watchAtRest(element, MIN_TOUCH_TARGET, options),
      holders: 0,
    };
    heldWatches.set(element, held);
  }
  held.holders += 1;
  const entry = held;
  let isReleased = false;
  return () => {
    if (isReleased) {
      return;
    }
    isReleased = true;
    entry.holders -= 1;
    queueMicrotask(() => {
      if (entry.holders === 0 && heldWatches.get(element) === entry) {
        heldWatches.delete(element);
        entry.stop();
      }
    });
  };
}

/**
 * A callback ref that keeps its element's hit insets live while `enabled`:
 * the element takes taps, so it is interactive and not disabled or read-only.
 * Merge it into the element's ref, and pair it with `touchHitAreaStyles.layer`
 * on the same element, or on a descendant with `ownsDescendantTouches` off.
 * The watch lasts while the element is attached, so a replaced element starts
 * its own. A re-render that hands the same element a
 * new merged ref keeps its watch. `options` set how the element grows. Keep
 * them stable, as a module constant. An element's first holder sets them.
 *
 * @example
 * ```
 * const hitAreaRef = useTouchHitArea(isInteractive && !isDisabled);
 * <li ref={hitAreaRef} {...stylex.props(isInteractive && touchHitAreaStyles.layer)} />
 * ```
 */
export function useTouchHitArea(
  enabled: boolean,
  options: TouchHitAreaOptions = NO_OPTIONS,
): RefCallback<HTMLElement> {
  // Syncs with an external system: the shared touch hit area
  // (utils/hitArea.ts) measures the element against its neighbors and writes
  // its insets on it. The ref's cleanup stops the watch.
  return useCallback(
    (element: HTMLElement | null) => {
      if (!enabled || element == null) {
        return undefined;
      }
      return holdWatch(element, options);
    },
    [enabled, options],
  );
}
