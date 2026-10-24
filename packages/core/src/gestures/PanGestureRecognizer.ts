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
 * - `scrollHandoff` (with a one-way direction; NOT UIKit, whose sheet leaves
 *   a drag that began as a scroll to the scroll view for its whole length):
 *   when the browser took the touch to scroll, keep watching it. Once the content runs out in the
 *   pan's direction, the travel beyond that point becomes the pan, after
 *   `contentEndHandoffSlop`; if the finger comes back, the translation
 *   clamps at zero while the content scrolls again, and a later pull past the
 *   end resumes the pan. The browser's events are no longer cancelable then,
 *   and nothing needs cancelling: the scroller is clamped at its end.
 */

import {UIKIT_GESTURES} from '../motion/uikit/gestures';
import {centroid} from './geometry';
import {
  ALL_NATIVE_TOUCH,
  GestureRecognizer,
  isActive,
  type GestureRecognizerOptions,
  type NativeTouchBehavior,
} from './GestureRecognizer';
import type {GestureEventContext, GestureTouch, Point} from './types';
import {VelocityTracker, type VelocityStrategy} from './VelocityTracker';

/** @experimental */
export type PanDirection =
  'any' | 'horizontal' | 'vertical' | 'left' | 'right' | 'up' | 'down';

/** @experimental */
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
   * exceed the movement across it to begin. Above 1, movement between the
   * two lines keeps the pan waiting (a thumb's arc is not yet a direction);
   * below 1, the pan claims drags up to atan(1 / axisRatio) off its axis.
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
  /** Take over a native scroll at its edge (one-way directions only). */
  scrollHandoff?: boolean;
  /** @default 'uikit' */
  velocityStrategy?: VelocityStrategy;
  /**
   * Travel (px) in a one-way pan's direction from which, while it is still
   * possible, it claims its touch: the host cancels the touch's moves, so the
   * browser cannot scroll first (WebKit claims a slow drag at 10–11 px). From
   * the first cancelled move the touch is the pan's (Safari gives the page no
   * scroll for that touch any more): a reversal no longer fails it, and it
   * begins at its hysteresis whichever way the finger goes. For overlays such
   * as toasts and banners: in UIKit a drag that starts on an overlay never
   * reaches the content behind it. A `scrollEdge` pan claims at its begin
   * instead, since UIKit gives a reversed drag to its content. `null` turns
   * it off.
   * @default EARLY_CLAIM_DISTANCE for a one-way pan without `scrollEdge`;
   *   none otherwise
   */
  claimDistance?: number | null;
}

/**
 * How far a finger may travel in a competing pan's direction before the pan
 * cancels the touch's moves, kept under the distance at which WebKit claims
 * a slow drag (10–11 px, SAFARI_SCROLL_CLAIM in motion/uikit/gestures.ts).
 * @source measured: Mobile Safari 26.2, iOS 26.2 simulator, HID drags:
 *   cancelling every touchmove from 8 px keeps a scrollable page still; a
 *   one-way upward pan over a scrollable page that cancels from 4–5 px keeps
 *   the page still and its card follows the finger exactly
 */
const EARLY_CLAIM_DISTANCE = 5;

const ZERO: Point = {x: 0, y: 0};

const DIRECTION_VECTORS: Partial<Record<PanDirection, Point>> = {
  left: {x: -1, y: 0},
  right: {x: 1, y: 0},
  up: {x: 0, y: -1},
  down: {x: 0, y: 1},
};

/** @experimental */
export class PanGestureRecognizer extends GestureRecognizer {
  minimumNumberOfTouches: number;
  maximumNumberOfTouches: number;
  hysteresis: number;
  direction: PanDirection;
  axisRatio: number;
  lockAxis: boolean;
  scrollEdge: boolean;
  scrollHandoff: boolean;
  /** See the option; `undefined` means the default for this pan's setup. */
  claimDistance: number | null | undefined;
  /** Whether a move was cancelled for this pan's early claim: the touch is its own. */
  isClaimCommitted = false;
  /** The axis a `lockAxis` pan locked to when it began. */
  lockedAxis: 'x' | 'y' | null = null;
  /** The movement the begin threshold took (excluded from `translation()`). */
  travelAtBegan: Point = ZERO;
  /** Whether this pan is driving the rest of a gesture the browser was scrolling. */
  isHandoff = false;

  private readonly tracker: VelocityTracker;
  /** The centroid where the gesture started, in client px. */
  private origin: Point = ZERO;
  /** Re-basing that keeps the translation continuous across finger changes. */
  private adjust: Point = ZERO;
  /** Translation since touch-down, before `setTranslation` offsets. */
  private raw: Point = ZERO;
  private offset: Point = ZERO;
  private virtual: Point = ZERO;
  private isObserving = false;
  private anchor: Point | null = null;
  private predictedAnchor: Point | null = null;

  constructor(options: PanGestureRecognizerOptions = {}) {
    super(options);
    this.minimumNumberOfTouches = options.minimumNumberOfTouches ?? 1;
    this.maximumNumberOfTouches =
      options.maximumNumberOfTouches ?? Number.POSITIVE_INFINITY;
    this.hysteresis = options.hysteresis ?? UIKIT_GESTURES.pan.hysteresis.value;
    this.direction = options.direction ?? 'any';
    this.axisRatio = options.axisRatio ?? 1;
    this.lockAxis = options.lockAxis ?? false;
    this.scrollEdge = options.scrollEdge ?? false;
    this.scrollHandoff = options.scrollHandoff ?? false;
    this.claimDistance = options.claimDistance;
    this.tracker = new VelocityTracker({
      strategy: options.velocityStrategy ?? 'uikit',
    });
  }

  /**
   * Movement since the pan began (or since `setTranslation`), client px; the
   * movement since touch-down while it is still possible.
   */
  translation(): Point {
    const base = this.isHandoff ? this.handoffTravel() : this.raw;
    const value = {x: base.x + this.offset.x, y: base.y + this.offset.y};
    return this.locked(value);
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
    const base = this.isHandoff ? this.handoffTravel() : this.raw;
    this.offset = {x: value.x - base.x, y: value.y - base.y};
  }

  /** Movement since the fingers landed, threshold included, client px. */
  totalTranslation(): Point {
    return this.isHandoff ? this.handoffTravel() : this.raw;
  }

  /**
   * Velocity in px/s, UIKit's way: after a rest it is the last moving value,
   * since a finger at rest sends no events.
   */
  velocity(): Point {
    return this.locked(this.tracker.velocity());
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
    if (
      this.scrollEdge ||
      this.scrollHandoff ||
      DIRECTION_VECTORS[this.direction] != null
    ) {
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
    if (this.isObserving) {
      return false;
    }
    if (
      isActive(this.state) &&
      this.numberOfTouches >= this.maximumNumberOfTouches
    ) {
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
      this.virtual = this.origin;
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
    touches: ReadonlyArray<GestureTouch>,
    event: GestureEventContext,
  ): void {
    this.track(touches, event.time);
    if (this.isObserving) {
      this.observeNativeScroll();
      return;
    }
    if (this.state === 'possible') {
      this.tryBegin();
    } else if (isActive(this.state)) {
      this.setState('changed');
    }
  }

  protected override touchesEnded(touches: ReadonlyArray<GestureTouch>): void {
    // UIKit reads neither the translation nor the velocity from the lift.
    const remaining = this.numberOfTouches - touches.length;
    if (isActive(this.state)) {
      if (remaining < this.minimumNumberOfTouches) {
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

  protected override touchesTakenByBrowser(
    touches: ReadonlyArray<GestureTouch>,
    event: GestureEventContext,
  ): boolean {
    if (
      this.scrollHandoff &&
      DIRECTION_VECTORS[this.direction] != null &&
      this.state === 'possible' &&
      this.pending == null
    ) {
      this.isObserving = true;
      this.anchor = null;
      return true;
    }
    return super.touchesTakenByBrowser(touches, event);
  }

  protected override reset(): void {
    this.isClaimCommitted = false;
    this.lockedAxis = null;
    this.travelAtBegan = ZERO;
    this.isHandoff = false;
    this.isObserving = false;
    this.anchor = null;
    this.predictedAnchor = null;
    this.origin = ZERO;
    this.adjust = ZERO;
    this.raw = ZERO;
    this.offset = ZERO;
    this.virtual = ZERO;
    this.tracker.reset();
  }

  /**
   * @internal Whether the host should cancel this pan's touch moves now,
   * before it begins: the finger has travelled `claimDistance` its way (or
   * the pan already committed to the touch), and the browser could
   * otherwise scroll it first.
   */
  claimsEarly(): boolean {
    if (this.state !== 'possible' || this.pending != null || this.isObserving) {
      return false;
    }
    if (this.isClaimCommitted) {
      return true;
    }
    const distance =
      this.claimDistance === undefined
        ? DIRECTION_VECTORS[this.direction] != null && !this.scrollEdge
          ? EARLY_CLAIM_DISTANCE
          : null
        : this.claimDistance;
    const count = this.numberOfTouches;
    if (
      distance == null ||
      count < this.minimumNumberOfTouches ||
      count > this.maximumNumberOfTouches
    ) {
      return false;
    }
    const moved = this.raw;
    return (
      Math.max(Math.abs(moved.x), Math.abs(moved.y)) >= distance &&
      this.classify(moved) === 'begin' &&
      !(this.scrollEdge && this.nativeCanScroll(moved.x, moved.y))
    );
  }

  /**
   * @internal The host cancelled a move for this pan's early claim: the
   * touch is the pan's now, and a reversal can no longer fail it.
   */
  commitClaim(): void {
    if (this.state === 'possible') {
      this.isClaimCommitted = true;
    }
  }

  /**
   * What this movement means for a pan limited to a direction: begin, fail,
   * or wait for more movement (see `axisRatio`).
   */
  protected classify(translation: Point): 'begin' | 'fail' | 'wait' {
    if (this.direction === 'any' || this.isClaimCommitted) {
      // A pan that committed to its touch begins whichever way it goes.
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
      return;
    }
    if (this.scrollEdge && this.nativeCanScroll(moved.x, moved.y)) {
      // The content under the finger still scrolls this way: it is a
      // scroll. A handoff pan waits for the browser to take it and watches;
      // any other pan leaves it alone.
      if (!this.scrollHandoff) {
        this.setState('failed');
      }
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
    if (this.isHandoff) {
      // The same rule past the content's end: leave out at most the slop
      // and keep the overshoot, so the surface's travel does not depend on
      // which moves the browser delivered (Chromium coalesces them while it
      // scrolls).
      const base = this.handoffTravel();
      const slop = UIKIT_GESTURES.scroll.contentEndHandoffSlop.value;
      const along = Math.hypot(base.x, base.y);
      const kept = along > 0 ? Math.min(along, slop) / along : 0;
      const swallowed = {x: base.x * kept, y: base.y * kept};
      this.travelAtBegan = swallowed;
      this.offset = {x: -swallowed.x, y: -swallowed.y};
      return;
    }
    const limit = this.hysteresis;
    const swallowed = {
      x: Math.sign(this.raw.x) * Math.min(Math.abs(this.raw.x), limit),
      y: Math.sign(this.raw.y) * Math.min(Math.abs(this.raw.y), limit),
    };
    this.travelAtBegan = swallowed;
    this.offset = {x: -swallowed.x, y: -swallowed.y};
  }

  /** After the browser took the touch: take over once the content runs out. */
  private observeNativeScroll(): void {
    const direction = DIRECTION_VECTORS[this.direction];
    if (direction == null) {
      return;
    }
    // While the pan drives the surface past the edge, the scroller is
    // clamped at its end: nothing can scroll, so skip the scroll read.
    const isPastEdge =
      this.isHandoff && dot(this.handoffTravel(), direction) > 0;
    if (!isPastEdge && this.nativeCanScroll(direction.x, direction.y)) {
      // The content still scrolls this way: it has the finger, and the
      // surface sits at zero until the content runs out again. Native touch
      // scrolling tracks the finger one to one, so the content will run out
      // after exactly the distance it has left.
      const left = this.nativeDistanceToEdge(direction.x, direction.y);
      this.anchor = null;
      this.predictedAnchor =
        left == null
          ? null
          : {
              x: this.virtual.x + direction.x * left,
              y: this.virtual.y + direction.y * left,
            };
      if (this.isHandoff) {
        this.setState('changed');
      }
      return;
    }
    // Where the content ran out: predicted from the distance it had left
    // when it last could scroll, else the first position seen at the edge.
    if (this.anchor == null) {
      const predicted = this.predictedAnchor;
      this.anchor =
        predicted != null &&
        dot(
          {x: predicted.x - this.virtual.x, y: predicted.y - this.virtual.y},
          direction,
        ) <= 0
          ? predicted
          : this.virtual;
      this.predictedAnchor = null;
    }
    if (this.isHandoff) {
      this.setState('changed');
      return;
    }
    if (
      dot(this.handoffTravel(), direction) >=
      UIKIT_GESTURES.scroll.contentEndHandoffSlop.value
    ) {
      this.isHandoff = true;
      this.startFromHere();
      this.setState('began');
    }
  }

  /** Travel past the content's end, along the pan's direction, never negative. */
  private handoffTravel(): Point {
    const direction = DIRECTION_VECTORS[this.direction];
    if (direction == null || this.anchor == null) {
      return ZERO;
    }
    const along = Math.max(
      0,
      dot(
        {x: this.virtual.x - this.anchor.x, y: this.virtual.y - this.anchor.y},
        direction,
      ),
    );
    return {x: direction.x * along, y: direction.y * along};
  }

  private nativeDistanceToEdge(dx: number, dy: number): number | null {
    for (const touch of this.touches.values()) {
      const left = touch.scroll?.distanceToEdge?.(dx, dy);
      if (left != null) {
        return left;
      }
    }
    return null;
  }

  private nativeCanScroll(dx: number, dy: number): boolean {
    for (const touch of this.touches.values()) {
      if (touch.scroll?.canScroll(dx, dy) === true) {
        return true;
      }
    }
    return false;
  }

  private track(touches: ReadonlyArray<GestureTouch>, time: number): void {
    const current = centroid(this.touches.values());
    const virtual = {
      x: current.x + this.adjust.x,
      y: current.y + this.adjust.y,
    };
    if (
      this.tracker.strategy !== 'uikit' &&
      this.numberOfTouches === 1 &&
      touches.length === 1
    ) {
      // The fitting estimators take every coalesced sample.
      for (const sample of touches[0].samples) {
        this.tracker.add(
          sample.x + this.adjust.x,
          sample.y + this.adjust.y,
          sample.time,
        );
      }
    } else {
      // UIKit's filter runs once per event.
      this.tracker.add(virtual.x, virtual.y, time);
    }
    this.virtual = virtual;
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

function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y;
}
