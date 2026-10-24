// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file GestureArena.ts
 * @input Touch input (began / moved / ended / cancelled / taken by the
 *   browser), each new touch with the recognizers on its hit path and the
 *   view-level consumer under it
 * @output Exports GestureArena (UIKit's gesture environment), its clock
 *   abstraction and the click disposition type
 * @position Pure coordinator of packages/core/src/gestures: no DOM. The DOM
 *   host (GestureHost.ts) feeds it real events and carries out what it
 *   decides; tests feed it synthetic streams with explicit timestamps.
 *
 * WHAT IT DECIDES, the way UIKit decides it:
 *
 * - Participation. A new touch is offered to every recognizer on its hit
 *   path, innermost first; each one that accepts it tracks it until it ends.
 * - Exclusivity. Two recognizers that share a touch are not active at once
 *   unless one of them allows it (`shouldRecognizeSimultaneously`). The first
 *   to recognize fails the other possible ones; a recognizer that tries to
 *   begin while a conflicting one is active fails instead.
 * - Failure requirements. A recognizer that requires another to fail waits
 *   (still `possible`) until that one fails, then recognizes; if that one
 *   recognizes, it fails. An idle recognizer holds nothing up.
 * - Delivery to the view. The touch's consumer (a pressable control) gets
 *   began / moved / ended unless a recognizer delays them
 *   (`delaysTouchesBegan`, `delaysTouchesEnded`) or recognizing cancels them
 *   (`cancelsTouchesInView`).
 * - The browser. A touch owned by a recognized gesture is CLAIMED: the host
 *   cancels the browser's pan and zoom for it. A touch whose gesture
 *   cancelled the view's touches has its click swallowed; a click held for a
 *   recognizer that may still recognize is DEFERRED, then replayed or dropped.
 *
 * TIME. Every input carries its timestamp, and timers are deadlines on that
 * same clock. Before an input is processed, every timer due at or before its
 * timestamp runs first, at its own deadline. A long press therefore begins at
 * exactly touch-down + 500 ms even when the main thread was blocked and the
 * timer callback came late, and a test drives the whole machine with explicit
 * timestamps and no real time at all.
 *
 * SYNC: When modified, update GestureRecognizer.ts, GestureHost.ts,
 * GestureArena.test.ts and README.md.
 */

import {
  isActive,
  isTerminal,
  type GestureRecognizer,
} from './GestureRecognizer';
import type {
  GestureEnvironment,
  GestureEventContext,
  GestureState,
  GestureTouch,
  TouchBeganInput,
  TouchConsumer,
  TouchInput,
  TouchSample,
} from './types';
import {DEFAULT_ENVIRONMENT} from './types';
import {internals} from './recognizerInternals';

export interface GestureClock {
  now(): number;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

/** The browser's clock: `performance.now()`, the base of `event.timeStamp`. */
export const browserClock: GestureClock = {
  now: () =>
    typeof performance === 'undefined' ? Date.now() : performance.now(),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * What the browser's click after a touch should do: pass, be swallowed, or
 * be swallowed now and replayed if the recognizers holding it all fail.
 */
export type ClickDisposition = 'allow' | 'suppress' | 'defer';

export interface ArenaBeganInput extends TouchBeganInput {
  /** The recognizers on the touch's hit path, innermost first. */
  readonly recognizers: ReadonlyArray<GestureRecognizer>;
  /** The innermost view-level consumer under the touch, if any. */
  readonly consumer?: TouchConsumer | null;
}

export interface GestureArenaOptions {
  clock?: GestureClock;
  environment?: GestureEnvironment;
  /** Touches a recognizer now owns: cancel the browser's default for them. */
  onClaim?: (touchIds: ReadonlyArray<number>) => void;
  /** A click deferred at touch end resolved: replay it, or drop it. */
  onDeferredClick?: (touch: GestureTouch, allowed: boolean) => void;
  /** Every recognizer transition, for debugging and tests. */
  onTransition?: (
    recognizer: GestureRecognizer,
    from: GestureState,
    to: GestureState,
  ) => void;
}

type ViewDelivery = 'none' | 'held' | 'delivered' | 'endHeld' | 'done';

interface TouchRecord {
  readonly touch: GestureTouch;
  readonly participants: GestureRecognizer[];
  readonly consumer: TouchConsumer | null;
  view: ViewDelivery;
  isLifted: boolean;
  isClaimed: boolean;
  suppressClick: boolean;
  deferredClick: boolean;
}

interface Timer {
  deadline: number;
  callback: () => void;
}

/**
 * The arena that decides which recognizer gets a touch.
 * @experimental
 */
export class GestureArena {
  readonly environment: GestureEnvironment;
  private readonly clock: GestureClock;
  private readonly options: GestureArenaOptions;
  private readonly records = new Map<number, TouchRecord>();
  /** Recognizers involved in the current interaction, in resolution order. */
  private active: GestureRecognizer[] = [];
  private readonly timers = new Map<GestureRecognizer, Timer>();
  private realTimer: unknown = null;
  private realTimerDeadline = Number.POSITIVE_INFINITY;
  /** The time of the event or timer being processed; null between them. */
  private currentTime: number | null = null;
  /** The latest time processed: input never moves the clock backwards. */
  private latestTime = Number.NEGATIVE_INFINITY;
  private depth = 0;

  constructor(options: GestureArenaOptions = {}) {
    this.options = options;
    this.clock = options.clock ?? browserClock;
    this.environment = options.environment ?? DEFAULT_ENVIRONMENT;
  }

  // --- Queries ---------------------------------------------------------------

  /** The current time on the event clock. */
  now(): number {
    return this.currentTime ?? Math.max(this.latestTime, this.clock.now());
  }

  /** Whether a recognizer owns this touch, so the browser must not pan or zoom it. */
  isClaimed(id: number): boolean {
    return this.records.get(id)?.isClaimed === true;
  }

  /** The live touch with this id. */
  getTouch(id: number): GestureTouch | undefined {
    return this.records.get(id)?.touch;
  }

  /** Every touch the arena tracks, lifted ones awaiting a decision included. */
  get touches(): ReadonlyArray<GestureTouch> {
    return [...this.records.values()].map(record => record.touch);
  }

  /** Recognizers taking part in the current interaction, in resolution order. */
  get involvedRecognizers(): ReadonlyArray<GestureRecognizer> {
    return this.active;
  }

  // --- Input -----------------------------------------------------------------

  /** New contacts, each with the recognizers on its hit path. */
  began(inputs: ReadonlyArray<ArenaBeganInput>): void {
    if (inputs.length === 0) {
      return;
    }
    this.run(inputs[0].time, () => {
      const newTouches = new Map<GestureRecognizer, GestureTouch[]>();
      const created: TouchRecord[] = [];
      for (const input of inputs) {
        if (this.records.has(input.id)) {
          continue;
        }
        const time = this.clampTime(input.time);
        const sample: TouchSample = {x: input.x, y: input.y, time};
        const touch: GestureTouch = {
          id: input.id,
          pointerType: input.pointerType,
          phase: 'began',
          x: input.x,
          y: input.y,
          time,
          startX: input.x,
          startY: input.y,
          startTime: time,
          samples: [...(input.history ?? []), sample],
          target: input.target,
          scroll: input.scroll ?? null,
          takenByBrowser: false,
        };
        const participants: GestureRecognizer[] = [];
        for (const recognizer of input.recognizers) {
          if (!internals(recognizer).wantsTouch(touch)) {
            continue;
          }
          participants.push(recognizer);
          internals(recognizer).arena = this;
          if (!this.active.includes(recognizer)) {
            this.active.push(recognizer);
          }
          const list = newTouches.get(recognizer) ?? [];
          list.push(touch);
          newTouches.set(recognizer, list);
        }
        const record: TouchRecord = {
          touch,
          participants,
          consumer: input.consumer ?? null,
          view: 'none',
          isLifted: false,
          isClaimed: false,
          suppressClick: false,
          deferredClick: false,
        };
        this.records.set(input.id, record);
        created.push(record);
      }
      const context = this.context();
      for (const recognizer of [...this.active]) {
        const touches = newTouches.get(recognizer);
        if (touches != null) {
          internals(recognizer).deliverBegan(touches, context);
        }
      }
      for (const record of created) {
        this.deliverViewBegan(record);
      }
    });
  }

  /** Contacts moved. */
  moved(inputs: ReadonlyArray<TouchInput>): void {
    if (inputs.length === 0) {
      return;
    }
    this.run(inputs[0].time, () => {
      const changed = this.update(inputs, 'moved');
      if (changed.length === 0) {
        return;
      }
      const context = this.context();
      for (const recognizer of [...this.active]) {
        internals(recognizer).deliverMoved(changed, context);
      }
      for (const touch of changed) {
        const record = this.records.get(touch.id);
        if (record?.view === 'delivered') {
          record.consumer?.touchMoved(touch);
        }
      }
    });
  }

  /**
   * Contacts lifted. Returns, per touch, what the browser's click for it
   * should do.
   */
  ended(inputs: ReadonlyArray<TouchInput>): Map<number, ClickDisposition> {
    const dispositions = new Map<number, ClickDisposition>();
    if (inputs.length === 0) {
      return dispositions;
    }
    this.run(inputs[0].time, () => {
      const changed = this.update(inputs, 'ended');
      const context = this.context();
      for (const recognizer of [...this.active]) {
        internals(recognizer).deliverEnded(changed, context);
      }
      for (const touch of changed) {
        const record = this.records.get(touch.id);
        if (record == null) {
          continue;
        }
        record.isLifted = true;
        dispositions.set(touch.id, this.resolveEnd(record));
      }
    });
    return dispositions;
  }

  /** The system took these contacts (`touchcancel`, a mouse `pointercancel`). */
  cancelled(ids: ReadonlyArray<number>, time: number): void {
    this.run(time, () => {
      const touches = this.liveTouches(ids);
      for (const touch of touches) {
        touch.phase = 'cancelled';
      }
      const context = this.context();
      for (const recognizer of [...this.active]) {
        internals(recognizer).deliverCancelled(touches, context);
      }
      for (const touch of touches) {
        const record = this.records.get(touch.id);
        if (record == null) {
          continue;
        }
        record.isLifted = true;
        record.suppressClick = true;
        this.cancelView(record);
      }
    });
  }

  /**
   * The browser took these contacts for its own pan or zoom: their pointer
   * stream is gone (`pointercancel`) and no click will follow. Possible
   * recognizers sharing them fail and active ones are cancelled, as UIKit
   * fails everything a scroll view's pan beats, except a recognizer that
   * keeps observing the touch to take it over at a scroll edge.
   */
  browserTookOver(ids: ReadonlyArray<number>, time: number): void {
    this.run(time, () => {
      const touches = this.liveTouches(ids).filter(
        touch => !touch.takenByBrowser,
      );
      if (touches.length === 0) {
        return;
      }
      for (const touch of touches) {
        touch.takenByBrowser = true;
      }
      const context = this.context();
      for (const recognizer of [...this.active]) {
        internals(recognizer).deliverTakenByBrowser(touches, context);
      }
      for (const touch of touches) {
        const record = this.records.get(touch.id);
        if (record == null) {
          continue;
        }
        record.suppressClick = true;
        this.cancelView(record);
      }
    });
  }

  /** Run every timer due at or before `time` (the host's timer and tests). */
  advanceTime(time: number): void {
    this.run(time, () => {});
  }

  // --- Recognizer requests (internal) ----------------------------------------

  /** @internal A recognizer asked for a state change. */
  requestTransition(recognizer: GestureRecognizer, next: GestureState): void {
    const from = recognizer.state;
    if (next === 'failed') {
      this.fail(recognizer);
      return;
    }
    if (
      internals(recognizer).pending != null &&
      (next === 'began' || next === 'ended')
    ) {
      // Already waiting on a requirement; the recognition stands as asked.
      return;
    }
    if (from === 'possible' && (next === 'began' || next === 'ended')) {
      this.attemptRecognition(recognizer, next);
      return;
    }
    if (isActive(from) && (next === 'changed' || next === 'ended')) {
      this.apply(recognizer, next);
      return;
    }
    if (isActive(from) && next === 'cancelled') {
      this.apply(recognizer, 'cancelled');
    }
  }

  /** @internal Arm a recognizer's one timer at an absolute deadline. */
  setTimer(
    recognizer: GestureRecognizer,
    deadline: number,
    callback: () => void,
  ): void {
    this.timers.set(recognizer, {deadline, callback});
    this.scheduleRealTimer();
  }

  /** @internal */
  clearTimer(recognizer: GestureRecognizer): void {
    if (this.timers.delete(recognizer)) {
      this.scheduleRealTimer();
    }
  }

  /** Cancel an active recognizer, or fail a possible one. */
  stop(recognizer: GestureRecognizer): void {
    this.run(this.now(), () => {
      if (isActive(recognizer.state)) {
        this.apply(recognizer, 'cancelled');
      } else if (recognizer.state === 'possible') {
        this.fail(recognizer);
      }
    });
  }

  // --- Resolution ------------------------------------------------------------

  private attemptRecognition(
    recognizer: GestureRecognizer,
    next: 'began' | 'ended',
  ): void {
    if (
      !internals(recognizer).shouldBegin() ||
      this.isVetoedByConsumer(recognizer)
    ) {
      this.fail(recognizer);
      return;
    }
    let isWaiting = false;
    for (const other of this.active) {
      if (
        other === recognizer ||
        !internals(recognizer).requiresFailureOf(other)
      ) {
        continue;
      }
      if (other.state === 'failed') {
        continue;
      }
      if (other.state !== 'possible') {
        // The requirement recognized (or is mid-gesture): this one cannot.
        this.fail(recognizer);
        return;
      }
      if (other.isInvolved()) {
        isWaiting = true;
      }
    }
    if (isWaiting) {
      internals(recognizer).pending = next;
      this.claim(recognizer);
      return;
    }
    for (const other of this.active) {
      if (
        other !== recognizer &&
        isActive(other.state) &&
        this.conflicts(other, recognizer)
      ) {
        this.fail(recognizer);
        return;
      }
    }
    this.apply(recognizer, next);
    // Recognizing beats every possible recognizer it conflicts with, and
    // everything that required it to fail.
    for (const other of [...this.active]) {
      if (other === recognizer || other.state !== 'possible') {
        continue;
      }
      if (
        internals(other).requiresFailureOf(recognizer) ||
        this.conflicts(recognizer, other)
      ) {
        this.fail(other);
      }
    }
    this.claim(recognizer);
    if (recognizer.cancelsTouchesInView) {
      this.cancelViewTouchesOf(recognizer);
    }
  }

  /** Whether `winner` being recognized prevents `other`. */
  private conflicts(
    winner: GestureRecognizer,
    other: GestureRecognizer,
  ): boolean {
    if (
      !sharesTouches(winner, other) ||
      internals(winner).allowsSimultaneous(other)
    ) {
      return false;
    }
    return winner.canPrevent(other) && other.canBePrevented(winner);
  }

  /** UIControl's rule: a control may veto an overlapping ancestor recognizer. */
  private isVetoedByConsumer(recognizer: GestureRecognizer): boolean {
    for (const id of internals(recognizer).seenTouchIds) {
      const consumer = this.records.get(id)?.consumer;
      if (consumer?.allowsAncestorRecognizer?.(recognizer) === false) {
        return true;
      }
    }
    return false;
  }

  private fail(recognizer: GestureRecognizer): void {
    if (isTerminal(recognizer.state)) {
      return;
    }
    if (isActive(recognizer.state)) {
      this.apply(recognizer, 'cancelled');
      return;
    }
    internals(recognizer).pending = null;
    this.apply(recognizer, 'failed');
    this.reviewPending();
  }

  private apply(recognizer: GestureRecognizer, next: GestureState): void {
    const from = recognizer.state;
    internals(recognizer).applyState(next);
    if (recognizer.state === next && from !== next) {
      this.options.onTransition?.(recognizer, from, next);
    } else if (next === 'changed' && from === 'changed') {
      this.options.onTransition?.(recognizer, from, next);
    }
    if (isTerminal(next)) {
      this.clearTimer(recognizer);
    }
  }

  /**
   * Re-run every waiting recognition whose requirements may have resolved.
   * Repeats until nothing changes, so chains (A waits on B waits on C)
   * settle in one pass.
   */
  private reviewPending(): void {
    let changed = true;
    while (changed) {
      changed = false;
      for (const recognizer of [...this.active]) {
        const next = internals(recognizer).pending;
        if (next == null || recognizer.state !== 'possible') {
          continue;
        }
        const blocked = this.active.some(
          other =>
            other !== recognizer &&
            internals(recognizer).requiresFailureOf(other) &&
            other.state === 'possible' &&
            other.isInvolved(),
        );
        if (blocked) {
          continue;
        }
        internals(recognizer).pending = null;
        this.attemptRecognition(recognizer, next);
        changed = true;
      }
    }
  }

  private claim(recognizer: GestureRecognizer): void {
    if (!recognizer.claimsTouches) {
      return;
    }
    const claimed: number[] = [];
    for (const touch of recognizer.trackedTouches) {
      const record = this.records.get(touch.id);
      if (record != null && !record.isLifted && !record.isClaimed) {
        record.isClaimed = true;
        claimed.push(touch.id);
      }
    }
    if (claimed.length > 0) {
      this.options.onClaim?.(claimed);
    }
  }

  // --- View delivery ---------------------------------------------------------

  private deliverViewBegan(record: TouchRecord): void {
    if (record.consumer == null || record.view !== 'none') {
      return;
    }
    if (record.suppressClick) {
      record.view = 'done';
      return;
    }
    if (this.beginDelayers(record)) {
      record.view = 'held';
      return;
    }
    record.view = 'delivered';
    record.consumer.touchBegan(record.touch);
  }

  /** What a lifted touch's view and click get, decided at the lift. */
  private resolveEnd(record: TouchRecord): ClickDisposition {
    if (record.suppressClick) {
      return 'suppress';
    }
    const isHeld = this.endDelayers(record);
    switch (record.view) {
      case 'delivered':
        if (isHeld) {
          record.view = 'endHeld';
          record.deferredClick = true;
          return 'defer';
        }
        record.view = 'done';
        record.consumer?.touchEnded(record.touch);
        return 'allow';
      case 'held':
        record.deferredClick = true;
        return 'defer';
      case 'none':
      case 'endHeld':
      case 'done':
        if (isHeld) {
          record.deferredClick = true;
          return 'defer';
        }
        return 'allow';
    }
  }

  /** Release whatever no recognizer is holding any more. */
  private reviewHeld(): void {
    for (const record of this.records.values()) {
      if (record.view === 'held' && !this.beginDelayers(record)) {
        if (record.suppressClick) {
          record.view = 'done';
        } else {
          record.view = 'delivered';
          record.consumer?.touchBegan(record.touch);
          if (record.isLifted && !this.endDelayers(record)) {
            record.view = 'done';
            record.consumer?.touchEnded(record.touch);
          } else if (record.isLifted) {
            record.view = 'endHeld';
          }
        }
      }
      if (record.view === 'endHeld' && !this.endDelayers(record)) {
        record.view = 'done';
        if (record.suppressClick) {
          record.consumer?.touchCancelled(record.touch);
        } else {
          record.consumer?.touchEnded(record.touch);
        }
      }
      if (
        record.deferredClick &&
        record.view !== 'held' &&
        record.view !== 'endHeld' &&
        !this.endDelayers(record)
      ) {
        record.deferredClick = false;
        this.options.onDeferredClick?.(record.touch, !record.suppressClick);
      }
    }
  }

  private beginDelayers(record: TouchRecord): boolean {
    return record.participants.some(
      recognizer =>
        recognizer.delaysTouchesBegan &&
        recognizer.state === 'possible' &&
        internals(recognizer).seenTouchIds.has(record.touch.id),
    );
  }

  private endDelayers(record: TouchRecord): boolean {
    return record.participants.some(
      recognizer =>
        recognizer.delaysTouchesEnded &&
        recognizer.state === 'possible' &&
        recognizer.isInvolved() &&
        internals(recognizer).seenTouchIds.has(record.touch.id),
    );
  }

  private cancelViewTouchesOf(recognizer: GestureRecognizer): void {
    for (const id of internals(recognizer).seenTouchIds) {
      const record = this.records.get(id);
      if (record == null) {
        continue;
      }
      record.suppressClick = true;
      this.cancelView(record);
    }
  }

  private cancelView(record: TouchRecord): void {
    if (record.view === 'delivered' || record.view === 'endHeld') {
      record.consumer?.touchCancelled(record.touch);
    }
    if (record.view !== 'none' || record.consumer != null) {
      record.view = 'done';
    }
  }

  // --- Plumbing --------------------------------------------------------------

  private context(): GestureEventContext {
    return {
      time: this.now(),
      allTouches: [...this.records.values()]
        .filter(record => !record.isLifted)
        .map(record => record.touch),
    };
  }

  private liveTouches(ids: ReadonlyArray<number>): GestureTouch[] {
    const touches: GestureTouch[] = [];
    for (const id of ids) {
      const record = this.records.get(id);
      if (record != null && !record.isLifted) {
        touches.push(record.touch);
      }
    }
    return touches;
  }

  private update(
    inputs: ReadonlyArray<TouchInput>,
    phase: 'moved' | 'ended',
  ): GestureTouch[] {
    const changed: GestureTouch[] = [];
    for (const input of inputs) {
      const record = this.records.get(input.id);
      if (record == null || record.isLifted) {
        continue;
      }
      const time = this.clampTime(input.time);
      const touch = record.touch;
      const history = (input.history ?? []).filter(
        sample => sample.time > touch.time && sample.time < time,
      );
      touch.samples = [...history, {x: input.x, y: input.y, time}];
      touch.x = input.x;
      touch.y = input.y;
      touch.time = time;
      touch.phase = phase;
      changed.push(touch);
    }
    return changed;
  }

  private clampTime(time: number): number {
    const clamped = Math.max(time, this.latestTime);
    this.latestTime = clamped;
    return clamped;
  }

  /**
   * One external entry: run the timers due by `time`, then `body`, then
   * settle (release held deliveries, reset finished recognizers, forget
   * finished touches). Re-entrant calls (a listener feeding input) run
   * inline and settle with the outermost one.
   */
  private run(time: number, body: () => void): void {
    this.depth += 1;
    try {
      this.flushTimers(time);
      this.currentTime = this.clampTime(time);
      body();
      this.settle();
    } finally {
      this.depth -= 1;
      if (this.depth === 0) {
        this.currentTime = null;
      }
    }
  }

  private flushTimers(upTo: number): void {
    for (;;) {
      let due: [GestureRecognizer, Timer] | null = null;
      for (const entry of this.timers) {
        if (
          entry[1].deadline <= upTo &&
          (due == null || entry[1].deadline < due[1].deadline)
        ) {
          due = entry;
        }
      }
      if (due == null) {
        break;
      }
      const [recognizer, timer] = due;
      this.timers.delete(recognizer);
      this.currentTime = this.clampTime(timer.deadline);
      timer.callback();
      this.settle();
    }
    this.scheduleRealTimer();
  }

  private settle(): void {
    this.reviewPending();
    this.reviewHeld();
    for (const recognizer of [...this.active]) {
      const isFinished =
        (isTerminal(recognizer.state) && recognizer.numberOfTouches === 0) ||
        (recognizer.state === 'possible' && !recognizer.isInvolved());
      if (!isFinished) {
        continue;
      }
      this.active = this.active.filter(other => other !== recognizer);
      const from = recognizer.state;
      internals(recognizer).resetToPossible();
      if (from !== 'possible') {
        this.options.onTransition?.(recognizer, from, 'possible');
      }
    }
    for (const [id, record] of this.records) {
      if (
        record.isLifted &&
        record.view !== 'held' &&
        record.view !== 'endHeld' &&
        !record.deferredClick
      ) {
        this.records.delete(id);
      }
    }
  }

  private scheduleRealTimer(): void {
    let earliest = Number.POSITIVE_INFINITY;
    for (const timer of this.timers.values()) {
      earliest = Math.min(earliest, timer.deadline);
    }
    if (earliest === this.realTimerDeadline) {
      return;
    }
    if (this.realTimer != null) {
      this.clock.clearTimeout(this.realTimer);
      this.realTimer = null;
    }
    this.realTimerDeadline = earliest;
    if (earliest === Number.POSITIVE_INFINITY) {
      return;
    }
    const delay = Math.max(0, earliest - this.clock.now());
    this.realTimer = this.clock.setTimeout(() => {
      this.realTimer = null;
      this.realTimerDeadline = Number.POSITIVE_INFINITY;
      this.advanceTime(Math.max(earliest, this.clock.now()));
    }, delay);
  }
}

function sharesTouches(a: GestureRecognizer, b: GestureRecognizer): boolean {
  for (const id of internals(a).seenTouchIds) {
    if (internals(b).seenTouchIds.has(id)) {
      return true;
    }
  }
  return false;
}
