// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file touchAction.ts
 * @input The recognizers attached to one element
 * @output Exports deriveTouchAction (the element's `touch-action`) and
 *   gestureHostStyle (every inline style a host sets for its recognizers)
 * @position Browser negotiation of packages/core/src/gestures, pure so a
 *   server render can emit the same style the client would set
 *
 * `touch-action` is decided when the finger lands and cannot change during
 * the gesture, so it must say up front what the browser may still do: the
 * intersection of what every recognizer on the element leaves it.
 *
 * - A tap or long press only removes double-tap zoom (`manipulation`): no
 *   300 ms click delay, scrolling and pinch-zoom untouched.
 * - A one-axis pan or swipe gives the browser the other axis.
 * - A pan that coordinates with native scrolling keeps both axes: the
 *   browser scrolls until the edge, and the pan claims from there.
 * - `pinch-zoom` stays in every value unless a pinch or rotation recognizer
 *   is attached, so the page stays zoomable (WCAG 1.4.4).
 *
 * WebKit pans a drag with any vertical component even under `pan-y`, so the
 * value alone does not protect a horizontal pan there: the host also cancels
 * `touchmove` while a recognizer owns the touch (see GestureHost.ts).
 */

import type {GestureRecognizer, NativeTouchBehavior} from './GestureRecognizer';
import {LongPressGestureRecognizer} from './LongPressGestureRecognizer';
import {internals} from './recognizerInternals';

/** The intersection of what each touch recognizer leaves the browser. */
export function combinedNativeBehavior(
  recognizers: ReadonlyArray<GestureRecognizer>,
): NativeTouchBehavior {
  let panX = true;
  let panY = true;
  let pinchZoom = true;
  let doubleTapZoom = true;
  for (const recognizer of recognizers) {
    if (!internals(recognizer).acceptsTouchInput) {
      continue;
    }
    const behavior = recognizer.nativeTouchBehavior;
    panX &&= behavior.panX;
    panY &&= behavior.panY;
    pinchZoom &&= behavior.pinchZoom;
    doubleTapZoom &&= behavior.doubleTapZoom;
  }
  return {panX, panY, pinchZoom, doubleTapZoom};
}

/** The `touch-action` value for a set of recognizers, or null for none needed. */
export function deriveTouchAction(
  recognizers: ReadonlyArray<GestureRecognizer>,
): string | null {
  const behavior = combinedNativeBehavior(recognizers);
  if (
    behavior.panX &&
    behavior.panY &&
    behavior.pinchZoom &&
    behavior.doubleTapZoom
  ) {
    return null;
  }
  if (behavior.panX && behavior.panY && behavior.pinchZoom) {
    return 'manipulation';
  }
  const tokens: string[] = [];
  if (behavior.panX) {
    tokens.push('pan-x');
  }
  if (behavior.panY) {
    tokens.push('pan-y');
  }
  if (behavior.pinchZoom) {
    tokens.push('pinch-zoom');
  }
  return tokens.length === 0 ? 'none' : tokens.join(' ');
}

export interface GestureHostStyle {
  touchAction?: string;
  WebkitTouchCallout?: string;
  WebkitUserSelect?: string;
  userSelect?: string;
}

/**
 * Every style a host sets for these recognizers: the `touch-action`, and for
 * a long press, no iOS callout and no text selection under the held finger
 * (a long-pressed row in UIKit selects no text).
 */
export function gestureHostStyle(
  recognizers: ReadonlyArray<GestureRecognizer>,
): GestureHostStyle {
  const style: GestureHostStyle = {};
  const touchAction = deriveTouchAction(recognizers);
  if (touchAction != null) {
    style.touchAction = touchAction;
  }
  if (
    recognizers.some(
      recognizer =>
        recognizer instanceof LongPressGestureRecognizer &&
        internals(recognizer).acceptsTouchInput,
    )
  ) {
    style.WebkitTouchCallout = 'none';
    style.WebkitUserSelect = 'none';
    style.userSelect = 'none';
  }
  return style;
}

/** What a `touch-action` value lets the browser do, as tokens. */
const ALL_PANS = [
  'pan-left',
  'pan-right',
  'pan-up',
  'pan-down',
  'pinch-zoom',
] as const;

function touchActionTokens(value: string): Set<string> {
  const parts = value
    .trim()
    .split(/\s+/)
    .filter(part => part !== '');
  const tokens = new Set<string>();
  if (parts.length === 0) {
    parts.push('auto');
  }
  for (const part of parts) {
    if (part === 'auto') {
      ALL_PANS.forEach(token => tokens.add(token));
      tokens.add('double-tap-zoom');
    } else if (part === 'manipulation') {
      ALL_PANS.forEach(token => tokens.add(token));
    } else if (part === 'pan-x') {
      tokens.add('pan-left').add('pan-right');
    } else if (part === 'pan-y') {
      tokens.add('pan-up').add('pan-down');
    } else if ((ALL_PANS as ReadonlyArray<string>).includes(part)) {
      tokens.add(part);
    }
  }
  return tokens;
}

/**
 * The `touch-action` that allows only what both values allow: the host's
 * derived value never overrides a caller's narrower one.
 */
export function intersectTouchAction(derived: string, caller: string): string {
  const own = touchActionTokens(caller);
  const both = new Set(
    [...touchActionTokens(derived)].filter(token => own.has(token)),
  );
  if (ALL_PANS.every(token => both.has(token))) {
    return both.has('double-tap-zoom') ? 'auto' : 'manipulation';
  }
  const parts: string[] = [];
  for (const [axis, start, end] of [
    ['pan-x', 'pan-left', 'pan-right'],
    ['pan-y', 'pan-up', 'pan-down'],
  ] as const) {
    if (both.has(start) && both.has(end)) {
      parts.push(axis);
    } else if (both.has(start)) {
      parts.push(start);
    } else if (both.has(end)) {
      parts.push(end);
    }
  }
  if (both.has('pinch-zoom')) {
    parts.push('pinch-zoom');
  }
  return parts.length === 0 ? 'none' : parts.join(' ');
}
