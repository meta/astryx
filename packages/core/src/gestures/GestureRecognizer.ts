// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file GestureRecognizer.ts
 * @input Touches delivered by a GestureArena
 * @output Exports GestureRecognizer, the base every recognizer extends
 *   (UIGestureRecognizer), and its options and listener types
 * @position Core of packages/core/src/gestures: subclasses interpret touches
 *   and request state changes; the arena decides whether a change is allowed
 *   (require-to-fail, exclusivity, should-begin) and applies it
 *
 * The state machine is UIKit's:
 *
 *   possible ─► began ─► changed* ─► ended | cancelled     (continuous)
 *   possible ─► ended                                       (discrete: "recognized")
 *   possible ─► failed
 *
 * A recognizer in a terminal state ignores the touches it still has and
 * returns to `possible` (its `reset()` runs) once all of them have ended,
 * exactly as UIKit resets a recognizer before the next touch sequence.
 *
 * Listeners (UIKit's target-action) fire for `began`, `changed`, `ended` and
 * `cancelled`, never for `failed`. They run synchronously inside the input
 * event, so a listener that writes a transform writes it in the same frame
 * as the input, with no React render in between.
 *
 * SYNC: When modified, update GestureArena.ts.
 */

import type {GestureArena} from './GestureArena';
import type {
  GestureEnvironment,
  GestureEventContext,
  GestureState,
  GestureTouch,
  Point,
  PointerKind,
} from './types';
import {DEFAULT_ENVIRONMENT} from './types';

export interface GestureRecognizerOptions<R = GestureRecognizer> {
  /** A name for debugging and test output. */
  name?: string;
  /** A disabled recognizer receives no touches; disabling one mid-gesture cancels it. @default true */
  isEnabled?: boolean;
  /**
   * When the gesture is recognized, cancel the view's touches: a pressed
   * control un-highlights without acting, and the browser's click for the
   * touch is swallowed. @default true
   */
  cancelsTouchesInView?: boolean;
  /** Hold the view's touch-began until this recognizer fails. @default false */
  delaysTouchesBegan?: boolean;
  /**
   * Hold the view's touch-ended (and the browser's click) while this
   * recognizer may still recognize. @default true
   */
  delaysTouchesEnded?: boolean;
  /** Pointer kinds this recognizer listens to (UIKit's `allowedTouchTypes`). @default all */
  allowedPointerTypes?: ReadonlyArray<PointerKind>;
  /** Ignore a touch of a different kind than the ones already tracked. @default true */
  requiresExclusiveTouchType?: boolean;
  /** gestureRecognizerShouldBegin: return false to fail instead of beginning. */
  shouldBegin?: (recognizer: R) => boolean;
  /** gestureRecognizer(_:shouldReceive:): return false to never see this touch. */
  shouldReceiveTouch?: (recognizer: R, touch: GestureTouch) => boolean;
  /** gestureRecognizer(_:shouldRecognizeSimultaneouslyWith:). */
  shouldRecognizeSimultaneously?: (
    recognizer: R,
    other: GestureRecognizer,
  ) => boolean;
  /** gestureRecognizer(_:shouldRequireFailureOf:). */
  shouldRequireFailureOf?: (recognizer: R, other: GestureRecognizer) => boolean;
  /** gestureRecognizer(_:shouldBeRequiredToFailBy:). */
  shouldBeRequiredToFailBy?: (
    recognizer: R,
    other: GestureRecognizer,
  ) => boolean;
}

export type GestureListener<R> = (recognizer: R) => void;

export type GestureTransitionListener<R> = (
  recognizer: R,
  from: GestureState,
  to: GestureState,
) => void;

const ACTION_STATES: ReadonlySet<GestureState> = new Set([
  'began',
  'changed',
  'ended',
  'cancelled',
]);

/** Transitions UIKit allows; anything else is a recognizer bug. */
const ALLOWED: Record<GestureState, ReadonlyArray<GestureState>> = {
  possible: ['began', 'ended', 'failed'],
  began: ['changed', 'ended', 'cancelled'],
  changed: ['changed', 'ended', 'cancelled'],
  ended: ['possible'],
  cancelled: ['possible'],
  failed: ['possible'],
};

export function isTransitionAllowed(
  from: GestureState,
  to: GestureState,
): boolean {
  return ALLOWED[from].includes(to);
}

export function isTerminal(state: GestureState): boolean {
  return state === 'ended' || state === 'cancelled' || state === 'failed';
}

export function isActive(state: GestureState): boolean {
  return state === 'began' || state === 'changed';
}

/** The browser behaviors `touch-action` can keep or remove. */
export interface NativeTouchBehavior {
  readonly panX: boolean;
  readonly panY: boolean;
  readonly pinchZoom: boolean;
  /** Double-tap to zoom, the reason for the old 300 ms click delay. */
  readonly doubleTapZoom: boolean;
}

export const ALL_NATIVE_TOUCH: NativeTouchBehavior = {
  panX: true,
  panY: true,
  pinchZoom: true,
  doubleTapZoom: true,
};

/** A tap-like recognizer only needs double-tap zoom gone (no click delay). */
export const MANIPULATION: NativeTouchBehavior = {
  panX: true,
  panY: true,
  pinchZoom: true,
  doubleTapZoom: false,
};

let nextRecognizerId = 1;

export abstract class GestureRecognizer {
  /** Stable id, for ordering and debugging. */
  readonly id = nextRecognizerId++;
  name: string;
  isEnabled: boolean;
  cancelsTouchesInView: boolean;
  delaysTouchesBegan: boolean;
  delaysTouchesEnded: boolean;
  allowedPointerTypes: ReadonlySet<PointerKind> | null;
  requiresExclusiveTouchType: boolean;
  /**
   * The element (or any object) the recognizer is attached to. The DOM host
   * sets it; the arena treats it as opaque.
   */
  view: unknown = null;

  /** @internal The arena delivering touches to this recognizer, if any. */
  arena: GestureArena | null = null;
  /** @internal A recognition waiting for a failure requirement. */
  pending: 'began' | 'ended' | null = null;

  /**
   * The delegate functions. Typed against the base so a subclass stays
   * assignable to GestureRecognizer; each is only ever called with `this`.
   */
  private readonly options: GestureRecognizerOptions<GestureRecognizer>;
  private stateValue: GestureState = 'possible';
  // Typed against the base so a subclass stays assignable to
  // GestureRecognizer; every listener is only ever called with `this`.
  private readonly listeners = new Set<GestureListener<GestureRecognizer>>();
  private readonly transitionListeners = new Set<
    GestureTransitionListener<GestureRecognizer>
  >();
  private readonly failureRequirements = new Set<GestureRecognizer>();
  private readonly simultaneousWith = new Set<GestureRecognizer>();
  /** Touches currently tracked, by id. */
  protected readonly touches = new Map<number, GestureTouch>();
  /** @internal Every touch id received since the last reset. */
  readonly seenTouchIds = new Set<number>();
  private lastLocation: Point = {x: 0, y: 0};

  constructor(options: GestureRecognizerOptions<never> = {}) {
    this.options =
      options as unknown as GestureRecognizerOptions<GestureRecognizer>;
    this.name = options.name ?? this.constructor.name;
    this.isEnabled = options.isEnabled ?? true;
    this.cancelsTouchesInView = options.cancelsTouchesInView ?? true;
    this.delaysTouchesBegan = options.delaysTouchesBegan ?? false;
    this.delaysTouchesEnded = options.delaysTouchesEnded ?? true;
    this.allowedPointerTypes =
      options.allowedPointerTypes == null
        ? null
        : new Set(options.allowedPointerTypes);
    this.requiresExclusiveTouchType =
      options.requiresExclusiveTouchType ?? true;
  }

  /** Discrete recognizers go from `possible` straight to `ended`. */
  get isDiscrete(): boolean {
    return false;
  }

  /**
   * Whether recognizing takes the touches from the browser: while a claiming
   * recognizer owns a touch, the host cancels the browser's pan and zoom for
   * it. Every touch recognizer claims; hover has no touches to claim.
   */
  get claimsTouches(): boolean {
    return true;
  }

  get state(): GestureState {
    return this.stateValue;
  }

  /**
   * What the browser may still do natively on this recognizer's view: the
   * host intersects these across a view's recognizers into its
   * `touch-action`. A recognizer that takes no touches constrains nothing.
   */
  get nativeTouchBehavior(): NativeTouchBehavior {
    return ALL_NATIVE_TOUCH;
  }

  /** @internal Whether this recognizer listens to touch at all. */
  get acceptsTouchInput(): boolean {
    return (
      this.allowedPointerTypes == null || this.allowedPointerTypes.has('touch')
    );
  }

  /** How many touches the recognizer is tracking right now. */
  get numberOfTouches(): number {
    return this.touches.size;
  }

  /** The touches being tracked, in the order they began. */
  get trackedTouches(): ReadonlyArray<GestureTouch> {
    return [...this.touches.values()];
  }

  /**
   * The centroid of the tracked touches in client coordinates; after they
   * end, where they were last.
   */
  location(): Point {
    if (this.touches.size === 0) {
      return this.lastLocation;
    }
    let x = 0;
    let y = 0;
    for (const touch of this.touches.values()) {
      x += touch.x;
      y += touch.y;
    }
    this.lastLocation = {x: x / this.touches.size, y: y / this.touches.size};
    return this.lastLocation;
  }

  /** Facts about the page (viewport, writing direction). */
  protected get environment(): GestureEnvironment {
    return this.arena?.environment ?? DEFAULT_ENVIRONMENT;
  }

  // --- Relationships -------------------------------------------------------

  /** UIKit's `require(toFail:)`: recognize only once `other` has failed. */
  requireToFail(other: GestureRecognizer): this {
    this.failureRequirements.add(other);
    return this;
  }

  /** Let this and `others` be recognized at the same time (both directions). */
  recognizeSimultaneouslyWith(...others: GestureRecognizer[]): this {
    for (const other of others) {
      this.simultaneousWith.add(other);
      other.simultaneousWith.add(this);
    }
    return this;
  }

  /** @internal Whether this recognizer must wait for `other` to fail. */
  requiresFailureOf(other: GestureRecognizer): boolean {
    return (
      this.failureRequirements.has(other) ||
      this.options.shouldRequireFailureOf?.(this, other) === true ||
      other.options.shouldBeRequiredToFailBy?.(other, this) === true
    );
  }

  /**
   * @internal Whether this and `other` may be active together: both allow it
   * (`recognizeSimultaneouslyWith` sets both sides; each delegate answers for
   * its own recognizer), so one delegate alone keeps them exclusive (FR15).
   */
  allowsSimultaneous(other: GestureRecognizer): boolean {
    return (
      this.simultaneousWith.has(other) ||
      (this.options.shouldRecognizeSimultaneously?.(this, other) === true &&
        other.options.shouldRecognizeSimultaneously?.(other, this) === true)
    );
  }

  /** @internal The delegate's should-begin answer. */
  shouldBegin(): boolean {
    return this.options.shouldBegin?.(this) ?? true;
  }

  /** UIKit's `canPrevent(_:)`: whether recognizing fails `other`. */
  canPrevent(_other: GestureRecognizer): boolean {
    return true;
  }

  /** UIKit's `canBePrevented(by:)`. */
  canBePrevented(_other: GestureRecognizer): boolean {
    return true;
  }

  /**
   * Whether this recognizer is still part of the current interaction: it
   * tracks touches, is waiting on a requirement, or (a multi-tap between
   * taps) expects more input. An idle `possible` recognizer cannot recognize
   * and so does not hold up anything that requires it to fail.
   */
  isInvolved(): boolean {
    return this.touches.size > 0 || this.pending != null;
  }

  // --- Listeners -----------------------------------------------------------

  /** Called on began, changed, ended (recognized) and cancelled. */
  addListener(listener: GestureListener<this>): () => void {
    const stored = listener as GestureListener<GestureRecognizer>;
    this.listeners.add(stored);
    return () => {
      this.listeners.delete(stored);
    };
  }

  /** Called on every transition, including failed and the reset to possible. */
  addTransitionListener(listener: GestureTransitionListener<this>): () => void {
    const stored = listener as GestureTransitionListener<GestureRecognizer>;
    this.transitionListeners.add(stored);
    return () => {
      this.transitionListeners.delete(stored);
    };
  }

  // --- Subclass API --------------------------------------------------------

  /** New touches for this recognizer. */
  protected touchesBegan(
    _touches: ReadonlyArray<GestureTouch>,
    _event: GestureEventContext,
  ): void {}

  protected touchesMoved(
    _touches: ReadonlyArray<GestureTouch>,
    _event: GestureEventContext,
  ): void {}

  /** Touches lifted; they are removed from `touches` after this returns. */
  protected touchesEnded(
    _touches: ReadonlyArray<GestureTouch>,
    _event: GestureEventContext,
  ): void {}

  /**
   * The system or the browser took these touches. By default an active
   * gesture is cancelled and a possible one fails.
   */
  protected touchesCancelled(
    _touches: ReadonlyArray<GestureTouch>,
    _event: GestureEventContext,
  ): void {
    if (isActive(this.state)) {
      this.setState('cancelled');
    } else if (this.state === 'possible') {
      this.setState('failed');
    }
  }

  /**
   * The browser took these touches for its own pan or zoom (their pointer
   * stream is gone). Return true to keep observing them; by default they are
   * treated as cancelled. An observer never claims them: a drag the browser
   * took stays the browser's (FR14).
   */
  protected touchesTakenByBrowser(
    touches: ReadonlyArray<GestureTouch>,
    event: GestureEventContext,
  ): boolean {
    this.touchesCancelled(touches, event);
    return false;
  }

  /**
   * A touch began elsewhere (off this recognizer's hit path) while this
   * recognizer tracks touches of its own. It is not this recognizer's touch
   * and is never delivered as one; a recognizer that a foreign finger should
   * end (a menu's press slide) cancels itself here. By default nothing
   * happens.
   */
  protected touchBeganElsewhere(
    _touches: ReadonlyArray<GestureTouch>,
    _event: GestureEventContext,
  ): void {}

  /** Clear per-gesture state before the next attempt. */
  protected reset(): void {}

  /**
   * Whether a touch may join. The base checks enabled, pointer kind and
   * exclusivity of kind; subclasses narrow it (a one-finger pan ignores a
   * second finger once it is moving).
   */
  protected acceptsTouch(touch: GestureTouch): boolean {
    if (!this.isEnabled) {
      return false;
    }
    if (
      this.allowedPointerTypes != null &&
      !this.allowedPointerTypes.has(touch.pointerType)
    ) {
      return false;
    }
    if (this.requiresExclusiveTouchType) {
      for (const existing of this.touches.values()) {
        if (existing.pointerType !== touch.pointerType) {
          return false;
        }
      }
    }
    return this.options.shouldReceiveTouch?.(this, touch) ?? true;
  }

  /**
   * Ask for a state change. The arena may refuse (the recognizer fails
   * instead) or defer it until a failure requirement resolves.
   */
  protected setState(next: GestureState): void {
    if (this.arena != null) {
      this.arena.requestTransition(this, next);
    } else {
      this.applyState(next);
    }
  }

  /** Arm the recognizer's one timer at an absolute time on the event clock. */
  protected setTimer(deadline: number, callback: () => void): void {
    this.arena?.setTimer(this, deadline, callback);
  }

  protected clearTimer(): void {
    this.arena?.clearTimer(this);
  }

  /** The event clock's current time. */
  protected now(): number {
    return this.arena?.now() ?? 0;
  }

  // --- Arena hooks (internal) ----------------------------------------------

  /** @internal Whether this recognizer takes `touch` right now. */
  wantsTouch(touch: GestureTouch): boolean {
    if (this.state !== 'possible' && !isActive(this.state)) {
      return false;
    }
    if (this.pending != null) {
      return false;
    }
    return this.acceptsTouch(touch);
  }

  /** @internal */
  deliverBegan(
    touches: ReadonlyArray<GestureTouch>,
    event: GestureEventContext,
  ): void {
    for (const touch of touches) {
      this.touches.set(touch.id, touch);
      this.seenTouchIds.add(touch.id);
    }
    this.location();
    this.touchesBegan(touches, event);
  }

  /** @internal */
  deliverBeganElsewhere(
    touches: ReadonlyArray<GestureTouch>,
    event: GestureEventContext,
  ): void {
    if (isTerminal(this.state)) {
      return;
    }
    this.touchBeganElsewhere(touches, event);
  }

  /** @internal */
  deliverMoved(
    touches: ReadonlyArray<GestureTouch>,
    event: GestureEventContext,
  ): void {
    const own = touches.filter(touch => this.touches.has(touch.id));
    if (own.length === 0 || isTerminal(this.state)) {
      return;
    }
    this.location();
    this.touchesMoved(own, event);
  }

  /** @internal */
  deliverEnded(
    touches: ReadonlyArray<GestureTouch>,
    event: GestureEventContext,
  ): void {
    const own = touches.filter(touch => this.touches.has(touch.id));
    if (own.length === 0) {
      return;
    }
    this.location();
    if (!isTerminal(this.state)) {
      this.touchesEnded(own, event);
    }
    for (const touch of own) {
      this.touches.delete(touch.id);
    }
  }

  /** @internal */
  deliverCancelled(
    touches: ReadonlyArray<GestureTouch>,
    event: GestureEventContext,
  ): void {
    const own = touches.filter(touch => this.touches.has(touch.id));
    if (own.length === 0) {
      return;
    }
    if (!isTerminal(this.state)) {
      this.touchesCancelled(own, event);
    }
    for (const touch of own) {
      this.touches.delete(touch.id);
    }
  }

  /** @internal */
  deliverTakenByBrowser(
    touches: ReadonlyArray<GestureTouch>,
    event: GestureEventContext,
  ): void {
    const own = touches.filter(touch => this.touches.has(touch.id));
    if (own.length === 0) {
      return;
    }
    if (!isTerminal(this.state) && this.touchesTakenByBrowser(own, event)) {
      return;
    }
    for (const touch of own) {
      this.touches.delete(touch.id);
    }
  }

  /**
   * UIKit's `isEnabled` setter: turning a recognizer off mid-gesture cancels
   * the gesture (an active one) or fails it (a possible one).
   */
  setEnabled(value: boolean): void {
    this.isEnabled = value;
    if (!value && (this.state !== 'possible' || this.isInvolved())) {
      this.cancel();
    }
  }

  /** Cancel this recognizer if it is active, or fail it if it is possible. */
  cancel(): void {
    if (this.arena != null) {
      this.arena.stop(this);
    } else if (isActive(this.state)) {
      this.applyState('cancelled');
    } else if (this.state === 'possible' && this.isInvolved()) {
      // An idle recognizer stays `possible`: nothing would ever reset it.
      this.applyState('failed');
    }
  }

  /** @internal Apply a transition the arena has approved. */
  applyState(next: GestureState): void {
    const from = this.stateValue;
    if (from === next && next !== 'changed') {
      return;
    }
    if (!isTransitionAllowed(from, next)) {
      return;
    }
    this.stateValue = next;
    if (next !== 'possible') {
      this.pending = null;
    }
    for (const listener of [...this.transitionListeners]) {
      listener(this, from, next);
    }
    if (ACTION_STATES.has(next)) {
      for (const listener of [...this.listeners]) {
        listener(this);
      }
    }
  }

  /** @internal Return to `possible` for the next attempt. */
  resetToPossible(): void {
    this.clearTimer();
    this.pending = null;
    this.touches.clear();
    this.seenTouchIds.clear();
    this.reset();
    this.applyState('possible');
  }
}
