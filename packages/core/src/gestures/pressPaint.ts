// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file pressPaint.ts
 * @input An element, the press state to paint on it, and its release clock
 * @output Exports paintPress and the PressPaint states: the one writer of the
 *   press attribute (`data-astryx-press`) for every painter of a press
 * @position Press paint of packages/core/src/gestures, shared by the
 *   delegated press consumer, selection-tracking groups and rows that keep
 *   a selection through a navigation
 *
 * The attribute carries the press for the styles that read it: `on` while
 * pressed, `held` while a row stays selected (a push to its detail), and
 * `fading` for the release, removed when the release clock runs out. Every
 * painter goes through `paintPress`, so the fade timer and the attribute
 * never drift apart, and a write lands only when the current value is one
 * the caller may replace (`onlyFrom`, by default: none, `on` or `fading`).
 * A `held` row is therefore never overwritten or cleared by a press; its
 * owner releases it with `onlyFrom: ['held']`.
 *
 * SYNC: When modified, update __tests__/pressPaint.test.ts and README.md.
 */

import {PRESSED_ATTRIBUTE} from '../utils/pressFeedback';
import {PRESS_FADE_MS} from '../utils/pressGesture';

export type PressPaint = 'on' | 'held' | 'fading' | 'none';

export interface PaintPressOptions {
  /** How long `fading` stays before the attribute goes, ms. @default the press fade */
  releaseMs?: number;
  /** @default 'data-astryx-press' */
  attribute?: string;
  /** The current values this write may replace. @default none, on, fading */
  onlyFrom?: ReadonlyArray<PressPaint>;
}

const DEFAULT_FROM: ReadonlyArray<PressPaint> = ['none', 'on', 'fading'];
const PAINTS: ReadonlySet<string> = new Set(['on', 'held', 'fading']);

const fadesByAttribute = new Map<
  string,
  WeakMap<Element, ReturnType<typeof setTimeout>>
>();

function fades(attribute: string) {
  let map = fadesByAttribute.get(attribute);
  if (map == null) {
    map = new WeakMap();
    fadesByAttribute.set(attribute, map);
  }
  return map;
}

/** The press state painted on `element` now; `null` for a value no painter wrote. */
export function readPressPaint(
  element: Element,
  attribute: string = PRESSED_ATTRIBUTE,
): PressPaint | null {
  const value = element.getAttribute(attribute);
  if (value == null) {
    return 'none';
  }
  return PAINTS.has(value) ? (value as PressPaint) : null;
}

/**
 * Paint `next` on `element` if its current press state is in `onlyFrom`.
 * Returns whether it painted.
 */
export function paintPress(
  element: Element,
  next: PressPaint,
  options: PaintPressOptions = {},
): boolean {
  const attribute = options.attribute ?? PRESSED_ATTRIBUTE;
  const current = readPressPaint(element, attribute);
  if (
    current == null ||
    !(options.onlyFrom ?? DEFAULT_FROM).includes(current)
  ) {
    return false;
  }
  const timers = fades(attribute);
  const pending = timers.get(element);
  if (pending != null) {
    clearTimeout(pending);
    timers.delete(element);
  }
  if (next === 'none') {
    element.removeAttribute(attribute);
    return true;
  }
  element.setAttribute(attribute, next);
  if (next === 'fading') {
    timers.set(
      element,
      setTimeout(() => {
        timers.delete(element);
        if (element.getAttribute(attribute) === 'fading') {
          element.removeAttribute(attribute);
        }
      }, options.releaseMs ?? PRESS_FADE_MS),
    );
  }
  return true;
}
