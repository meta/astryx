// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PanGestureRecognizer.ts
 * @input Touches from a GestureArena, each with a probe of the native
 *   scrollers under it
 * @output Exports PanGestureRecognizer (UIPanGestureRecognizer), its options
 *   and direction type
 * @position Continuous recognizer of packages/core/src/gestures; the base of
 *   ScreenEdgePanGestureRecognizer
 *
 * Begins once the touches' centroid has travelled `hysteresis` px along
 * either axis (UIKit applies it per axis, not as a distance) with between
 * `minimumNumberOfTouches` and `maximumNumberOfTouches` fingers down, in the
 * allowed `direction`. As in UIKit, `translation()` is reset when the pan
 * begins, so the travel spent on the threshold is not part of it and a
 * dragged surface does not jump; `totalTranslation()` is the movement since
 * the fingers landed, and `travelAtBegan` what the threshold took.
 * `velocity()` is UIKit's own filter (see VelocityTracker), fed one sample
 * per event; the lift's position updates neither, as in UIKit. Adding or
 * lifting a finger never jumps the translation: the centroid is re-based so
 * the gesture continues where it was. Once moving, fingers past the maximum
 * are ignored, so a second finger never breaks a one-finger pan.
 *
 * NATIVE SCROLL COORDINATION, for a pan over content the browser scrolls
 * (a sheet over its own list):
 *
 * - `scrollEdge`: the pan begins only if no scroller under the touch could
 *   scroll for that movement — the finger landed at the edge and pulls away
 *   from it. The browser has not committed yet, so beginning claims the
 *   touch and the browser never scrolls.
 *
 * Who gets the drag is decided once, when it begins: a drag that began as
 * the browser's scroll stays the browser's to the lift and rubber-bands at
 * the content's edge, as a UIKit scroll view keeps it (`spec:AST-094` FR14).
 */

import {UIKIT_PAN} from '../motion/uikit/gestures';
import {centroid} from './geometry';
import {
  ALL_NATIVE_TOUCH,
  GestureRecognizer,
  isActive,
  type GestureRecognizerOptions,
  type NativeTouchBehavior,
} from './GestureRecognizer';
import type {GestureEventContext, GestureTouch, Point} from './types';
import {VelocityTracker} from './VelocityTracker';

export type PanDirection =
  'any' | 'horizontal' | 'vertical' | 'left' | 'right' | 'up' | 'down';

export interface PanGestureRecognizerOptions extends GestureRecognizerOptions<PanGestureRecognizer> {
  /** @default 1 */
  minimumNumberOfTouches?: number;
  /** @default Infinity */
  maximumNumberOfTouches?: number;
  hysteresis?: number;
  /** Movement that may begin the pan; anything else fails it. @default 'any' */
  direction?: PanDirection;
  /**
   * For a pan limited to an axis: how much the movement along the axis must
   * exceed the movement across it to begin. Above 1, movement that is still
   * between the two lines when the pan reaches its hysteresis fails it: a pan
   * that competes with native scrolling decides within 10 px
   * (`spec:AST-094` FR19). Below 1, the pan claims drags up to
   * atan(1 / axisRatio) off its axis.
   * @default 1
   */
  axisRatio?: number;
  /**
   * With `direction: 'any'`, report movement along the axis that dominated
   * at the start only (UIScrollView's directional lock).
   */
  lockAxis?: boolean;
  /** Begin only when the native scrollers under the touch are at the edge. */
  scrollEdge?: boolean;
}

const ZERO: Point = {x: 0, y: 0};

const DIRECTION_VECTORS: Partial<Record<PanDirection, Point>> = {
  left: {x: -1, y: 0},
  right: {x: 1, y: 0},
  up: {x: 0, y: -1},
  down: {x: 0, y: 1},
};

export class PanGestureRecognizer extends GestureRecognizer {
  minimumNumberOfTouches: number;
  maximumNumberOfTouches: number;
  hysteresis: number;
  direction: PanDirection;
  axisRatio: number;
  lockAxis: boolean;
  scrollEdge: boolean;
  /** The axis a `lockAxis` pan locked to when it began. */
  lockedAxis: 'x' | 'y' | null = null;
  /** The movement the begin threshold took (excluded from `translation()`). */
  travelAtBegan: Point = ZERO;

  private readonly tracker: VelocityTracker;
  /** The lift's event time once the pan ended: its release (AST-100 FR2). */
  private releaseTime: number | undefined = undefined;
  /** The centroid where the gesture started, in client px. */
  private origin: Point = ZERO;
  /** Re-basing that keeps the translation continuous across finger changes. */
  private adjust: Point = ZERO;
  /** Translation since touch-down, before `setTranslation` offsets. */
  private raw: Point = ZERO;
  private offset: Point = ZERO;

  constructor(options: PanGestureRecognizerOptions = {}) {
    super(options);
    this.minimumNumberOfTouches = options.minimumNumberOfTouches ?? 1;
    this.maximumNumberOfTouches =
      options.maximumNumberOfTouches ?? Number.POSITIVE_INFINITY;
    this.hysteresis = options.hysteresis ?? UIKIT_PAN.hysteresis.value;
    this.direction = options.direction ?? 'any';
    this.axisRatio = options.axisRatio ?? 1;
    this.lockAxis = options.lockAxis ?? false;
    this.scrollEdge = options.scrollEdge ?? false;
    this.tracker = new VelocityTracker();
  }

  /**
   * Movement since the pan began (or since `setTranslation`), client px; the
   * movement since touch-down while it is still possible.
   */
  translation(): Point {
    return this.locked({
      x: this.raw.x + this.offset.x,
      y: this.raw.y + this.offset.y,
    });
  }

  /**
   * Change the allowed direction for the next gesture (a pan in progress
   * keeps the one it began with). The element's touch-action is derived
   * when the recognizer is attached: switching between directions that
   * leave the browser the same touches (up and down) needs nothing more.
   */
  setDirection(direction: PanDirection): void {
    this.direction = direction;
  }

  /** UIKit's `setTranslation(_:in:)`: make the current translation read `value`. */
  setTranslation(value: Point): void {
    this.offset = {x: value.x - this.raw.x, y: value.y - this.raw.y};
  }

  /** Movement since the fingers landed, threshold included, client px. */
  totalTranslation(): Point {
    return this.raw;
  }

  /**
   * Velocity in px/s, UIKit's way, for a dragged surface. At the release it
   * is 0 when the finger rested longer than the stillness interval before
   * lifting, or moved fewer than twice (spec:AST-100 FR2).
   */
  velocity(): Point {
    return this.locked(this.tracker.velocity(this.releaseTime));
  }

  /**
   * A scrolling surface's release velocity in px/s (paging, a wheel): the
   * scroll-view blend of the pan's last two values, with the same release
   * rules (architecture:interaction-modality INV10).
   */
  scrollVelocity(): Point {
    return this.locked(
      this.tracker.scrollVelocity(
        this.releaseTime ?? this.tracker.lastSample?.time ?? 0,
      ),
    );
  }

  /**
   * The browser keeps the axis a two-way pan does not use. A one-way pan,
   * and a pan that coordinates with native scrolling, leave the browser
   * everything: the other direction still scrolls (a toast dragged away from
   * its edge scrolls the page), and the pan claims its own direction by
   * cancelling `touchmove` when it begins, below the distance at which the
   * browser decides to scroll. Pinch-zoom stays the browser's.
   */
  override get nativeTouchBehavior(): NativeTouchBehavior {
    if (this.scrollEdge || DIRECTION_VECTORS[this.direction] != null) {
      return ALL_NATIVE_TOUCH;
    }
    const horizontal =
      this.direction === 'horizontal' ||
      this.direction === 'left' ||
      this.direction === 'right';
    const vertical =
      this.direction === 'vertical' ||
      this.direction === 'up' ||
      this.direction === 'down';
    return {
      panX: vertical,
      panY: horizontal,
      pinchZoom: true,
      doubleTapZoom: false,
    };
  }

  protected override acceptsTouch(touch: GestureTouch): boolean {
    if (
      isActive(this.state) &&
      this.numberOfTouches >= this.maximumNumberOfTouches
    ) {
      // A moving pan keeps its fingers: an extra one never fails it.
      return false;
    }
    return super.acceptsTouch(touch);
  }

  protected override touchesBegan(
    touches: ReadonlyArray<GestureTouch>,
    event: GestureEventContext,
  ): void {
    if (this.numberOfTouches === touches.length) {
      this.origin = centroid(this.touches.values());
      this.adjust = ZERO;
      this.raw = ZERO;
      this.offset = ZERO;
      this.tracker.reset();
      this.tracker.add(this.origin.x, this.origin.y, event.time);
    } else {
      this.rebase(new Set(touches.map(touch => touch.id)), 'added');
    }
    if (
      this.state === 'possible' &&
      this.numberOfTouches > this.maximumNumberOfTouches
    ) {
      this.setState('failed');
    }
  }

  protected override touchesMoved(
    _touches: ReadonlyArray<GestureTouch>,
    event: GestureEventContext,
  ): void {
    this.track(event.time);
    if (this.state === 'possible') {
      this.tryBegin();
    } else if (isActive(this.state)) {
      this.setState('changed');
    }
  }

  protected override touchesEnded(
    touches: ReadonlyArray<GestureTouch>,
    event: GestureEventContext,
  ): void {
    // UIKit reads neither the translation nor the velocity from the lift; the
    // lift's time only decides whether the finger was still (AST-100 FR2).
    const remaining = this.numberOfTouches - touches.length;
    if (isActive(this.state)) {
      if (remaining < this.minimumNumberOfTouches) {
        this.releaseTime = event.time;
        this.setState('ended');
        return;
      }
      this.rebase(new Set(touches.map(touch => touch.id)), 'removed');
      return;
    }
    if (remaining === 0 || remaining < this.minimumNumberOfTouches) {
      this.setState('failed');
      return;
    }
    this.rebase(new Set(touches.map(touch => touch.id)), 'removed');
  }

  protected override reset(): void {
    this.lockedAxis = null;
    this.travelAtBegan = ZERO;
    this.origin = ZERO;
    this.adjust = ZERO;
    this.raw = ZERO;
    this.offset = ZERO;
    this.releaseTime = undefined;
    this.tracker.reset();
  }

  /**
   * What this movement means for a pan limited to a direction: begin, fail,
   * or undecided (between `axisRatio`'s lines), which fails it too once it
   * reaches its hysteresis.
   */
  protected classify(translation: Point): 'begin' | 'fail' | 'wait' {
    if (this.direction === 'any') {
      return 'begin';
    }
    const isHorizontal =
      this.direction === 'horizontal' ||
      this.direction === 'left' ||
      this.direction === 'right';
    const along = isHorizontal ? translation.x : translation.y;
    const across = Math.abs(isHorizontal ? translation.y : translation.x);
    const magnitude = Math.abs(along);
    if (magnitude > this.axisRatio * across) {
      // The axis is decided; a one-way pan also needs the right sign.
      const vector = DIRECTION_VECTORS[this.direction];
      const sign = vector == null ? 0 : vector.x + vector.y;
      return sign === 0 || Math.sign(along) === sign ? 'begin' : 'fail';
    }
    return across * Math.min(1, this.axisRatio) > magnitude ? 'fail' : 'wait';
  }

  private tryBegin(): void {
    const count = this.numberOfTouches;
    if (count < this.minimumNumberOfTouches) {
      return;
    }
    if (count > this.maximumNumberOfTouches) {
      this.setState('failed');
      return;
    }
    const moved = this.raw;
    if (Math.max(Math.abs(moved.x), Math.abs(moved.y)) < this.hysteresis) {
      return;
    }
    const verdict = this.classify(moved);
    if (verdict === 'fail') {
      this.setState('failed');
      return;
    }
    if (verdict === 'wait') {
      // Past its 10 px begin and still no clear axis: a pan that competes
      // with native scrolling must decide by then (`spec:AST-094` FR19), so
      // it leaves the touch to the browser.
      this.setState('failed');
      return;
    }
    if (this.scrollEdge && this.nativeCanScroll(moved.x, moved.y)) {
      // The content under the finger still scrolls this way: it is a scroll,
      // the browser's to the lift (FR14).
      this.setState('failed');
      return;
    }
    if (this.lockAxis && this.direction === 'any') {
      this.lockedAxis = Math.abs(moved.x) >= Math.abs(moved.y) ? 'x' : 'y';
    }
    this.startFromHere();
    this.setState('began');
  }

  /**
   * Leave the threshold's travel out of the translation, as UIKit does at
   * .began: up to `hysteresis` px per axis, so a slow drag starts at zero and
   * a step that overshoots keeps the overshoot (measured: a slow diagonal
   * that crossed at (10.67, 10.67) reads (0.67, 0.67); a 3:1 drag crossing at
   * (11, 3.67) reads (1, 0)). Some fast first moves read zero in UIKit; that
   * case is not modelled.
   */
  private startFromHere(): void {
    const limit = this.hysteresis;
    const swallowed = {
      x: Math.sign(this.raw.x) * Math.min(Math.abs(this.raw.x), limit),
      y: Math.sign(this.raw.y) * Math.min(Math.abs(this.raw.y), limit),
    };
    this.travelAtBegan = swallowed;
    this.offset = {x: -swallowed.x, y: -swallowed.y};
  }

  private nativeCanScroll(dx: number, dy: number): boolean {
    for (const touch of this.touches.values()) {
      if (touch.scroll?.canScroll(dx, dy) === true) {
        return true;
      }
    }
    return false;
  }

  private track(time: number): void {
    const current = centroid(this.touches.values());
    const virtual = {
      x: current.x + this.adjust.x,
      y: current.y + this.adjust.y,
    };
    // UIKit's filter runs once per event.
    this.tracker.add(virtual.x, virtual.y, time);
    this.raw = {x: virtual.x - this.origin.x, y: virtual.y - this.origin.y};
  }

  /** Keep the translation continuous when fingers join or leave. */
  private rebase(
    changedIds: ReadonlySet<number>,
    kind: 'added' | 'removed',
  ): void {
    const all = centroid(this.touches.values());
    const others = centroid(this.touches.values(), changedIds);
    const [before, after] = kind === 'added' ? [others, all] : [all, others];
    this.adjust = {
      x: this.adjust.x + before.x - after.x,
      y: this.adjust.y + before.y - after.y,
    };
  }

  private locked(value: Point): Point {
    if (this.lockedAxis === 'x') {
      return {x: value.x, y: 0};
    }
    if (this.lockedAxis === 'y') {
      return {x: 0, y: value.y};
    }
    return value;
  }
}
