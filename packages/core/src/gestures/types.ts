// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file types.ts
 * @input Nothing
 * @output Exports the data the gesture system passes around: recognizer
 *   states, pointer kinds, touches (UITouch), the per-event context, the
 *   environment a host provides, and the view-level touch consumer contract
 * @position Shared vocabulary of packages/core/src/gestures; no runtime code
 */

/**
 * UIGestureRecognizer.State. A discrete recognizer goes straight from
 * `possible` to `ended` (UIKit's `.recognized` is the same value).
 */
export type GestureState =
  'possible' | 'began' | 'changed' | 'ended' | 'cancelled' | 'failed';

/** What made the contact. A pen on an iPad is `pen`, not `touch`. */
export type PointerKind = 'touch' | 'mouse' | 'pen';

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** One position of a contact at one instant, in client (viewport) CSS px. */
export interface TouchSample {
  readonly x: number;
  readonly y: number;
  /** Milliseconds on the `performance.now()` clock (an event's `timeStamp`). */
  readonly time: number;
}

export type TouchPhase = 'began' | 'moved' | 'ended' | 'cancelled';

/**
 * The scrollers between a touch and the page, as the host sees them: enough
 * for a recognizer to ask whether the browser would scroll something if the
 * finger moved one way, without the recognizer touching the DOM.
 */
export interface NativeScrollProbe {
  /**
   * Whether a finger moving by (dx, dy) would scroll some element under the
   * touch (one that has room left in that direction and whose `touch-action`
   * lets the browser pan that axis).
   */
  canScroll(dx: number, dy: number): boolean;
  /**
   * How much further (px) the scroller that would move for a finger moving
   * by (dx, dy) can scroll before it reaches its edge; 0 when none would.
   * Lets a reader place the point where the content runs out between two
   * samples instead of at the next one.
   */
  distanceToEdge?(dx: number, dy: number): number;
  /** Whether any element under the touch can scroll natively at all. */
  readonly isInsideScroller: boolean;
  /**
   * Whether `touch-action` from the touch target to the page lets the
   * browser pan at all: when it does not, the browser cannot have taken the
   * touch for a scroll, whatever its events say.
   */
  readonly allowsNativePan: boolean;
}

/**
 * One contact: UITouch. The arena owns it and updates it in place; a
 * recognizer keeps a reference to every touch it receives.
 */
export interface GestureTouch {
  /** Unique among the contacts the arena tracks at once. */
  readonly id: number;
  readonly pointerType: PointerKind;
  phase: TouchPhase;
  /** Latest position, client CSS px. */
  x: number;
  y: number;
  /** Timestamp of the latest position. */
  time: number;
  readonly startX: number;
  readonly startY: number;
  readonly startTime: number;
  /**
   * Positions since the previous event, oldest first, ending with the
   * current one (coalesced samples where the platform has them). Velocity
   * trackers read these; actions fire once per event.
   */
  samples: TouchSample[];
  /** The node the contact began on. Opaque to the arena. */
  readonly target: unknown;
  /** The native scrollers under the contact, when the host knows them. */
  readonly scroll: NativeScrollProbe | null;
  /** The browser took this contact for its own pan or zoom. */
  takenByBrowser: boolean;
}

/** The input a host hands the arena for one contact in one event. */
export interface TouchInput {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly time: number;
  /** Extra positions since the previous event, oldest first (coalesced). */
  readonly history?: ReadonlyArray<TouchSample>;
}

/** A new contact: where it is, what made it, and what it landed on. */
export interface TouchBeganInput extends TouchInput {
  readonly pointerType: PointerKind;
  readonly target: unknown;
  readonly scroll?: NativeScrollProbe | null;
}

/** What a recognizer is told alongside the touches that changed. */
export interface GestureEventContext {
  /** Timestamp of the event being processed. */
  readonly time: number;
  /** Every contact the arena currently tracks, not only this recognizer's. */
  readonly allTouches: ReadonlyArray<GestureTouch>;
}

/**
 * Facts about the page a recognizer may need and must not read from the DOM
 * itself: the viewport for screen-edge pans, and the writing direction of a
 * view for `leading` / `trailing`.
 */
export interface GestureEnvironment {
  viewportSize(): {readonly width: number; readonly height: number};
  isRtl(view: unknown): boolean;
}

export const DEFAULT_ENVIRONMENT: GestureEnvironment = {
  viewportSize() {
    if (typeof window === 'undefined') {
      return {width: 0, height: 0};
    }
    return {width: window.innerWidth, height: window.innerHeight};
  },
  isRtl() {
    return false;
  },
};

/**
 * A view-level touch consumer: what UIKit delivers `touchesBegan` /
 * `touchesEnded` to when no gesture recognizer takes the touch (a UIControl).
 * The arena delivers through it, honoring `delaysTouchesBegan`,
 * `delaysTouchesEnded` and `cancelsTouchesInView`.
 */
export interface TouchConsumer {
  touchBegan(touch: GestureTouch): void;
  touchMoved(touch: GestureTouch): void;
  touchEnded(touch: GestureTouch): void;
  touchCancelled(touch: GestureTouch): void;
  /**
   * UIControl's iOS 6 rule: a control's own action wins over an overlapping
   * single-tap recognizer on an ancestor. Return false to stop `recognizer`
   * (attached above this consumer) from beginning for a touch on it.
   */
  allowsAncestorRecognizer?(recognizer: unknown): boolean;
}
