// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file HoverGestureRecognizer.ts
 * @input Hover enter / move / exit reports from a GestureHost
 * @output Exports HoverGestureRecognizer (UIHoverGestureRecognizer)
 * @position Continuous recognizer of packages/core/src/gestures that takes
 *   no touches: a mouse or a hovering pen over its view
 *
 * Began when a hovering pointer (no button pressed) enters the view, changed
 * as it moves inside, ended when it leaves. A finger never hovers, so the
 * recognizer is silent on touch screens, as UIKit's is on an iPhone. It
 * claims nothing and conflicts with nothing: the host drives it directly,
 * outside the touch arena.
 */

import {
  GestureRecognizer,
  isActive,
  isTerminal,
  type GestureRecognizerOptions,
} from './GestureRecognizer';
import type {Point, PointerKind} from './types';

/** @experimental */
export class HoverGestureRecognizer extends GestureRecognizer {
  private point: Point = {x: 0, y: 0};
  /** The kind of pointer hovering: a mouse, or a pen in range. */
  pointerType: PointerKind | null = null;

  constructor(options: GestureRecognizerOptions<HoverGestureRecognizer> = {}) {
    super(options);
  }

  override get claimsTouches(): boolean {
    return false;
  }

  override location(): Point {
    return this.point;
  }

  /** @internal The host saw a hovering pointer enter the view. */
  hoverEntered(point: Point, pointerType: PointerKind): void {
    if (!this.isEnabled || isActive(this.state)) {
      return;
    }
    if (isTerminal(this.state)) {
      // Cancelled mid-hover (disabled, or `cancel()`), with no arena to
      // reset it: a new hover starts over.
      this.resetToPossible();
    }
    this.point = point;
    this.pointerType = pointerType;
    this.applyState('began');
  }

  /** @internal */
  hoverMoved(point: Point): void {
    if (!isActive(this.state)) {
      return;
    }
    this.point = point;
    this.applyState('changed');
  }

  /** @internal The pointer left, pressed, or went away. */
  hoverExited(point?: Point): void {
    if (!isActive(this.state)) {
      return;
    }
    if (point != null) {
      this.point = point;
    }
    this.applyState('ended');
    this.resetToPossible();
    this.pointerType = null;
  }
}
