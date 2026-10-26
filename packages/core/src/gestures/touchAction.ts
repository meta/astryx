// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file touchAction.ts
 * @input The recognizers attached to one element
 * @output Exports deriveTouchAction (the element's `touch-action`) and
 *   gestureHostStyle (the inline style a host sets for its recognizers). The
 *   selection and callout lock for one held press is the recognizer's own
 *   `selectionLock` (gestures/selectionLock.ts), which the host calls
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

/** The intersection of what each touch recognizer leaves the browser. */
export function combinedNativeBehavior(
  recognizers: ReadonlyArray<GestureRecognizer>,
): NativeTouchBehavior {
  let panX = true;
  let panY = true;
  let pinchZoom = true;
  let doubleTapZoom = true;
  for (const recognizer of recognizers) {
    if (!recognizer.acceptsTouchInput) {
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
 * The style a host sets for these recognizers while they are attached: the
 * `touch-action`. Text selection is not locked here: a mouse, a keyboard and
 * assistive technology keep selecting as they do today (spec:AST-017 FR59,
 * spec:AST-094 FR41).
 */
export function gestureHostStyle(
  recognizers: ReadonlyArray<GestureRecognizer>,
): GestureHostStyle {
  const style: GestureHostStyle = {};
  const touchAction = deriveTouchAction(recognizers);
  if (touchAction != null) {
    style.touchAction = touchAction;
  }
  return style;
}
