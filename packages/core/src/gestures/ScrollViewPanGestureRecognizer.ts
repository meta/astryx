// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ScrollViewPanGestureRecognizer.ts
 * @input Touches from a GestureArena
 * @output Exports ScrollViewPanGestureRecognizer, the pan a scroll view
 *   drags with, and its options
 * @position Continuous recognizer of packages/core/src/gestures: a pan whose
 *   velocity is the one a scroll view releases with
 *
 * UIScrollView drags with its own pan recognizer and, when the finger lifts,
 * hands `scrollViewWillEndDragging` that recognizer's last two velocities
 * blended once more (`velocity.scrollReleaseWeight`, measured). A component
 * that behaves like a scroll view (a picker wheel, a momentum carousel) reads
 * its release from this recognizer, so it coasts as far as UIKit's; anything
 * else reads a plain pan's. Same filter, a fixed constant per kind: no option.
 */

import {
  PanGestureRecognizer,
  type PanGestureRecognizerOptions,
} from './PanGestureRecognizer';
import type {Point} from './types';
import type {VelocityTracker} from './VelocityTracker';

/** @experimental */
export type ScrollViewPanGestureRecognizerOptions = PanGestureRecognizerOptions;

/** @experimental */
export class ScrollViewPanGestureRecognizer extends PanGestureRecognizer {
  /** A scroll view's release: its pan's last two velocities, blended. */
  protected override readVelocity(tracker: VelocityTracker): Point {
    return tracker.scrollReleaseVelocity();
  }
}
