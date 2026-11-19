// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file contextMenuPress.ts
 * @input Touches from the gesture arena and the context-menu constants
 * @output ContextMenuPressRecognizer: the long press that opens a context menu
 *   on UIContextMenuInteraction's timeline under a finger, and the press it
 *   reports
 * @position ContextMenu's touch invocation, on the gesture foundation;
 *   ContextMenu.tsx attaches it to the trigger
 *
 * SYNC: When modified, update /packages/core/src/ContextMenu/ContextMenu.tsx
 * and /packages/core/src/ContextMenu/contextMenuPress.test.ts
 */

import {isActive} from '../gestures/GestureRecognizer';
import {
  LongPressGestureRecognizer,
  type LongPressGestureRecognizerOptions,
} from '../gestures/LongPressGestureRecognizer';
import type {GestureEventContext, GestureTouch} from '../gestures/types';
import {contextMenu} from '../motion/uikit/contextMenu';

const {commitMs, menuDisplayMs, allowableMovement} = contextMenu.press;

/**
 * How long the finger's moves may pause before the menu stops waiting for
 * late ones, in ms: three frames at 60 Hz.
 */
const LATE_MOVE_GAP_MS = 50;

/**
 * The page counts as behind its input when an input or a timer runs this long
 * after its own time. In ms: two frames at 60 Hz.
 */
const LATE_INPUT_MS = 33;

/**
 * The menu's timer ran behind a blocked page when it runs this long after its
 * deadline. In ms: one frame at 60 Hz. A timer has no dispatch delay of its
 * own, so one frame is enough.
 */
const LATE_TIMER_MS = 17;

/**
 * The foundation's own press timer, which this recognizer never lets fire:
 * the hold below commits instead. It is longer than any hold, and under the
 * window timer's 2^31 - 1 ms limit.
 */
const NEVER_MS = 2 ** 30;

/** A finger that may become a context menu: when and where it landed. */
export interface ContextMenuPress {
  /** On the event clock (`performance.now()`, an event's `timeStamp`), ms. */
  readonly time: number;
  /** Client CSS px. */
  readonly x: number;
  readonly y: number;
}

export type ContextMenuPressRecognizerOptions = Omit<
  LongPressGestureRecognizerOptions,
  | 'allowableMovement'
  | 'minimumPressDuration'
  | 'numberOfTapsRequired'
  | 'numberOfTouchesRequired'
>;

/**
 * A context menu is not UIKit's plain long press (500 ms, 10 pt of travel).
 * Its timeline is `contextMenu.press`, and these are the recognizer's states:
 * - `possible`: the finger landed. A lift, a second finger, or a browser
 *   scroll fails it. A drift past `allowableMovement` on either
 *   axis fails it too.
 * - `began` at `commitMs`: the click haptic. The recognizer claims the touch.
 *   The page stops scrolling under it, and the lift sends no click and no
 *   compatibility mouse events. The menu does not show yet. A drift past
 *   `allowableMovement` still ends it with no menu (`cancelled`). A lift shows
 *   the menu at once (`ended` without `isMenuDue`).
 * - `changed` with `isMenuDue` at `menuDisplayMs`: the finger is still down,
 *   and the menu shows. From then on, the finger moves freely.
 *
 * The hold runs on the arena's clock and timers, so the commit lands at its
 * deadline even when the main thread is busy. The foundation's long press
 * gives the claim and failure rules and the trigger's style. It never begins
 * on its own timer, only at the hold's commit. A press that fails or is
 * cancelled reports it through `addTransitionListener`, while `press` still
 * names it.
 */
export class ContextMenuPressRecognizer extends LongPressGestureRecognizer {
  /** The finger in play, from its landing until the gesture resets. */
  press: ContextMenuPress | null = null;
  /**
   * The finger stayed until `menuDisplayMs`: the menu is due, and the finger
   * moves freely from here.
   */
  isMenuDue = false;
  /**
   * Hears each press as the recognizer takes it: the touch, and the time it
   * landed on the arena's clock.
   */
  onPressBegan: ((touch: GestureTouch, time: number) => void) | null = null;
  /** The finger the hold follows. */
  private pressTouchId: number | null = null;
  /** Where the finger landed, while its hold runs. The drift counts from here. */
  private holdFrom: {x: number; y: number} | null = null;
  /**
   * The held finger's latest move: the time it came with, and when the page
   * got it.
   */
  private latestMove: {time: number; arrivedAt: number} | null = null;
  /** When the finger landed, on the arena's clock. The deadlines count from it. */
  private holdStart = 0;
  /** The menu's moment passed while the finger's moves still came late. */
  private isMenuWaiting = false;

  constructor(options: ContextMenuPressRecognizerOptions = {}) {
    super({
      ...options,
      // A finger or a pen; a mouse opens the menu with its secondary button.
      allowedPointerTypes: options.allowedPointerTypes ?? ['touch', 'pen'],
      minimumPressDuration: NEVER_MS,
      // The hold's own tolerance is the drift rule (touchesMoved below).
      allowableMovement: Infinity,
    });
  }

  /**
   * The event clock at this moment: the timestamp of the input (or the
   * deadline of the timer) being processed. Read it from a listener to
   * place what the transition starts at the time it happened.
   */
  get clockTime(): number {
    return this.now();
  }

  protected override touchesBegan(
    touches: ReadonlyArray<GestureTouch>,
    event: GestureEventContext,
  ): void {
    super.touchesBegan(touches, event);
    if (
      this.press == null &&
      this.state === 'possible' &&
      this.numberOfTouches === this.numberOfTouchesRequired
    ) {
      const [touch] = touches;
      this.press = {time: event.time, x: touch.x, y: touch.y};
      this.pressTouchId = touch.id;
      // The hold's deadlines count from the touch itself. This replaces the
      // foundation's own press timer, which never fires.
      this.holdFrom = {x: touch.x, y: touch.y};
      this.holdStart = event.time;
      this.setTimer(event.time + commitMs, () => this.commit());
      this.onPressBegan?.(touch, event.time);
    }
  }

  protected override touchesMoved(touches: ReadonlyArray<GestureTouch>): void {
    const touch = touches.find(each => each.id === this.pressTouchId);
    if (touch != null) {
      this.latestMove = {time: touch.inputTime, arrivedAt: this.pageTime()};
    }
    const hasDrifted = touch != null && !this.followHold(touch);
    if (hasDrifted && this.state === 'possible') {
      this.setState('failed');
      return;
    }
    if (hasDrifted && isActive(this.state) && !this.isMenuDue) {
      this.setState('cancelled');
      return;
    }
    super.touchesMoved(touches);
  }

  /**
   * Follows the finger during its hold, through each sample of the move at
   * the time it came with. A sample from the menu's moment on shows a
   * waiting menu: the finger stayed inside the tolerance until then, and it
   * moves freely after. A drift past `allowableMovement` on either axis ends
   * the hold. Returns whether the hold still runs.
   */
  private followHold(touch: GestureTouch): boolean {
    const moment = this.holdStart + menuDisplayMs;
    for (const sample of touch.inputSamples) {
      const from = this.holdFrom;
      if (from == null) {
        return false;
      }
      if (this.isMenuWaiting && sample.time >= moment) {
        this.presentMenu();
      }
      if (
        Math.abs(sample.x - from.x) > allowableMovement ||
        Math.abs(sample.y - from.y) > allowableMovement
      ) {
        this.endHold();
        return false;
      }
    }
    return this.holdFrom != null;
  }

  private endHold(): void {
    this.clearTimer();
    this.stopMoveWait();
    this.holdFrom = null;
  }

  private stopMoveWait(): void {
    if (this.isMenuWaiting) {
      this.isMenuWaiting = false;
      this.clearTimer();
    }
  }

  /** The hold's commit claims the finger, then waits for the menu's moment. */
  private commit(): void {
    if (this.holdFrom == null) {
      return;
    }
    if (
      this.state === 'possible' &&
      this.numberOfTouches === this.numberOfTouchesRequired
    ) {
      this.beganAt = this.now();
      this.setState('began');
    }
    // A transition listener can end the hold.
    if (this.holdFrom != null) {
      this.setTimer(this.holdStart + menuDisplayMs, () => this.showMenu());
    }
  }

  /**
   * The finger is still down at the menu's moment: the menu is due. When the
   * page is behind its input, the finger's moves can reach it after that
   * moment, though they came before it. While they still come, the menu
   * waits for them, so a drift in them still ends the hold. A timer that ran
   * late ran behind a blocked page, which may hold such moves too.
   */
  private showMenu(): void {
    if (!this.isMenuPending()) {
      return;
    }
    const moment = this.holdStart + menuDisplayMs;
    if (this.pageTime() - moment > LATE_TIMER_MS || this.hasLateMove()) {
      this.waitForMoves();
      return;
    }
    this.presentMenu();
  }

  /** The wait's end: moves that still come late keep the menu waiting. */
  private endMoveWait(): void {
    this.stopMoveWait();
    if (!this.isMenuPending()) {
      return;
    }
    if (this.hasLateMove()) {
      this.waitForMoves();
      return;
    }
    this.presentMenu();
  }

  private isMenuPending(): boolean {
    return this.holdFrom != null && isActive(this.state) && !this.isMenuDue;
  }

  private waitForMoves(): void {
    this.isMenuWaiting = true;
    // On the arena's clock, like the hold's own deadlines. It counts from when
    // the page runs again. Behind a block, the event clock still reads the
    // moment, and moves stamped after it are still queued.
    const from = Math.max(this.now(), this.pageTime());
    this.setTimer(from + LATE_MOVE_GAP_MS, () => this.endMoveWait());
  }

  /** When the page runs now, on the arena's injected clock. */
  private pageTime(): number {
    return this.arena?.pageTime() ?? this.now();
  }

  private presentMenu(): void {
    this.stopMoveWait();
    this.isMenuDue = true;
    this.setState('changed');
  }

  /**
   * Whether a move from before the menu's moment reached the page in the last
   * `LATE_MOVE_GAP_MS`, more than `LATE_INPUT_MS` after its own time.
   */
  private hasLateMove(): boolean {
    const move = this.latestMove;
    const now = this.pageTime();
    return (
      move != null &&
      move.time < this.holdStart + menuDisplayMs &&
      now - move.arrivedAt < LATE_MOVE_GAP_MS &&
      move.arrivedAt - move.time > LATE_INPUT_MS
    );
  }

  protected override reset(): void {
    super.reset();
    this.endHold();
    this.pressTouchId = null;
    this.press = null;
    this.latestMove = null;
    this.isMenuDue = false;
  }
}
