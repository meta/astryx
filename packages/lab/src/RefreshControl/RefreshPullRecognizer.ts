// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file RefreshPullRecognizer.ts
 * @input Touches from the gesture arena (Core's internal touch entry)
 * @output Exports RefreshPullRecognizer, the vertical pan that reads a pull
 *   to refresh without taking the touch, and RefreshScrollPullRecognizer
 * @position The gesture of useRefreshControl, on the foundation's
 *   PanGestureRecognizer
 *
 * SYNC: When modified, update:
 * - /packages/lab/src/RefreshControl/useRefreshControl.ts
 */

// UIKit's refresh pull is the scroll view's own drag, not a second gesture.
// One touch can scroll, pull past the top, and scroll the same content again.
// So this pan never claims its touch, and only watches it. The browser keeps
// the finger for native scrolling, so nothing changes hands midway. The pan
// reads the finger to draw the overscroll, because the scroll owner's
// `overscroll-behavior-y` is `none` near the top.
//
// The pan begins on vertical travel past its hysteresis. The touch layer
// starts the pull where the content is at its top and the finger moves down.
// When the browser takes the touch to scroll, the pan keeps reading it to the
// lift. A second finger is the browser's, for pinch-zoom.
//
// A trackpad's scroll pulls through RefreshScrollPullRecognizer. A pen's or
// a mouse's drag stays the browser's, for text selection: the pan takes only
// a finger. `pointerType` and `scrollType` record the first contact's input.
// `onTouchDown` reports that contact landing, so a settle in flight can stop
// where it is, as UIScrollView brakes on touch-down.

import {
  PanGestureRecognizer,
  type PanGestureRecognizerOptions,
} from '@astryxdesign/core/internal/touch';
import type {
  GestureEventContext,
  GestureTouch,
  PointerKind,
} from '@astryxdesign/core/internal/touch';

export class RefreshPullRecognizer extends PanGestureRecognizer {
  /** Called when the first contact of a gesture lands, with its timestamp. */
  onTouchDown: ((time: number) => void) | null = null;
  /** The pointer of the gesture's first contact. */
  pointerType: PointerKind = 'touch';
  /** Set when the gesture is a trackpad's scroll rather than a contact. */
  scrollType: GestureTouch['scrollType'] | null = null;

  constructor(options: PanGestureRecognizerOptions = {}) {
    super({
      name: 'RefreshPull',
      direction: 'vertical',
      maximumNumberOfTouches: 1,
      allowedPointerTypes: ['touch'],
      ...options,
    });
  }

  /** Native scrolling keeps the finger: the pull only reads it. */
  override get claimsTouches(): boolean {
    return false;
  }

  protected override touchesBegan(
    touches: ReadonlyArray<GestureTouch>,
    event: GestureEventContext,
  ): void {
    if (this.numberOfTouches === touches.length) {
      const touch = touches[0];
      this.pointerType = touch?.pointerType ?? 'touch';
      this.scrollType = touch?.scrollType ?? null;
      this.onTouchDown?.(event.time);
    }
    super.touchesBegan(touches, event);
  }
}

/**
 * The scroll pull: a trackpad's two-finger scroll at the top. It is a
 * scroll-edge pan that takes a trackpad's scroll and no pointer. So it takes a
 * scroll only where nothing under the pointer could scroll: the owner at its
 * top and the content moving down. The host cancels each wheel event of a
 * gesture that it takes, so its element gets a blocking `wheel` listener. Only
 * a recognizer that claims may register one. It takes no pointer, so it adds
 * no `touchmove` listener.
 */
export class RefreshScrollPullRecognizer extends RefreshPullRecognizer {
  constructor(options: PanGestureRecognizerOptions = {}) {
    super({
      name: 'RefreshScrollPull',
      scrollEdge: true,
      allowedPointerTypes: [],
      allowedScrollTypes: ['continuous'],
      ...options,
    });
  }

  /** The scroll it takes is its own: the host cancels its wheel events. */
  override get claimsTouches(): boolean {
    return true;
  }
}
