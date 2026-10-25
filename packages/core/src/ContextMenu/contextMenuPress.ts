// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file contextMenuPress.ts
 * @input Touches from the gesture arena; the context-menu constants; the
 *   long-press detector (useLongPress's createLongPressDetector)
 * @output Exports ContextMenuPressRecognizer: the long press that opens a
 *   context menu on UIContextMenuInteraction's timeline (feedback, commit,
 *   menu) under a finger, on every touch device, and the press it reports
 * @position ContextMenu's touch invocation, on the gesture foundation
 *   (../gestures); ContextMenu.tsx attaches it to the trigger
 *
 * A context menu is not UIKit's plain long press (500 ms, 10 pt of travel).
 * Its timeline (contextMenu.press), as the states of this recognizer:
 * - `possible`: the finger landed (`onPressStart`); the press feedback
 *   shows from `feedbackOnsetMs`. A lift, a second finger, the browser
 *   taking the touch to scroll, or a drift past `allowableMovement` on
 *   either axis: `failed`.
 * - `began` at `commitMs`: the click haptic. The recognizer claims the
 *   touch (the page stops scrolling under it, and the lift sends no click
 *   and no compatibility mouse events). The menu is not shown yet; a drift
 *   past `allowableMovement` still ends it with no menu (`cancelled`), and
 *   a lift shows it at once (`ended` without `isMenuDue`).
 * - `changed` with `isMenuDue` at `menuDisplayMs`: the finger is still
 *   down and the menu shows. From then on the finger moves freely.
 *
 * The hold runs on useLongPress's detector (createLongPressDetector), the
 * one long-press source in core: the commit is its delay, the menu a later
 * stage, the drift its tolerance, each passed as the measured value. The
 * detector keeps its deadlines on this recognizer's arena (its event clock
 * and timers), so the commit lands at its deadline even under a blocked main
 * thread. The recognizer is a LongPressGestureRecognizer for the foundation's
 * claim and failure rules (a lift, a second finger, the browser taking the
 * touch) and the long press's style on the trigger; it never begins on its
 * own timer, only at the detector's long press. A press that fails or is cancelled reports it through
 * `addTransitionListener`, while `press` still names it.
 *
 * SYNC: When modified, update /packages/core/src/ContextMenu/ContextMenu.tsx
 * and /packages/core/src/ContextMenu/contextMenuPress.test.ts
 */

import {
  isActive,
  LongPressGestureRecognizer,
  type GestureEventContext,
  type GestureTouch,
  type LongPressGestureRecognizerOptions,
} from '../gestures';
import {createLongPressDetector} from '../hooks/useLongPress';
import {contextMenu} from '../motion/uikit';

const {commitMs, menuDisplayMs, allowableMovement} = contextMenu.press;

/**
 * The foundation's own press timer, which this recognizer never lets fire
 * (the detector commits it): longer than any hold, and within the range a
 * window timer takes.
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

export interface ContextMenuPressRecognizerOptions extends Omit<
  LongPressGestureRecognizerOptions,
  | 'allowableMovement'
  | 'minimumPressDuration'
  | 'numberOfTapsRequired'
  | 'numberOfTouchesRequired'
> {
  /** A finger landed and may become a context menu. */
  onPressStart?: (recognizer: ContextMenuPressRecognizer) => void;
}

export class ContextMenuPressRecognizer extends LongPressGestureRecognizer {
  /** The finger in play, from its landing until the gesture resets. */
  press: ContextMenuPress | null = null;
  /**
   * The finger stayed until `menuDisplayMs`: the menu is due, and the finger
   * moves freely from here.
   */
  isMenuDue = false;
  private readonly onPressStart:
    ((recognizer: ContextMenuPressRecognizer) => void) | undefined;
  /** The finger the hold follows. */
  private pressTouchId: number | null = null;
  /** The hold, on the arena's clock: the commit, then the menu's stage. */
  private readonly detector = createLongPressDetector(() => ({
    delayMs: commitMs,
    moveCancelPx: allowableMovement,
    stages: [{delayMs: menuDisplayMs, onStage: () => this.showMenu()}],
    onLongPress: () => this.commit(),
    scheduler: {
      now: () => this.now(),
      setTimer: (deadline, callback) => {
        this.setTimer(deadline, callback);
        return () => this.clearTimer();
      },
    },
  }));

  constructor(options: ContextMenuPressRecognizerOptions = {}) {
    const {onPressStart, ...rest} = options;
    super({
      ...rest,
      // A finger or a pen; a mouse opens the menu with its secondary button.
      allowedPointerTypes: options.allowedPointerTypes ?? ['touch', 'pen'],
      minimumPressDuration: NEVER_MS,
      // The drift rule is the detector's tolerance (touchesMoved below).
      allowableMovement: Infinity,
    });
    this.onPressStart = onPressStart;
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
      // The hold's deadlines count from the touch itself (this replaces the
      // foundation's own press timer, which never fires).
      this.detector.start({x: touch.x, y: touch.y}, event.time);
      this.onPressStart?.(this);
    }
  }

  protected override touchesMoved(touches: ReadonlyArray<GestureTouch>): void {
    const touch = touches.find(each => each.id === this.pressTouchId);
    const hasDrifted =
      touch != null && !this.detector.moveTo({x: touch.x, y: touch.y});
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

  /** The detector's long press: the commit claims the finger. */
  private commit(): void {
    if (
      this.state === 'possible' &&
      this.numberOfTouches === this.numberOfTouchesRequired
    ) {
      this.beganAt = this.now();
      this.setState('began');
    }
  }

  /** The detector's later stage: the finger is still down, the menu is due. */
  private showMenu(): void {
    if (isActive(this.state)) {
      this.isMenuDue = true;
      this.setState('changed');
    }
  }

  protected override reset(): void {
    super.reset();
    this.detector.cancel();
    this.pressTouchId = null;
    this.press = null;
    this.isMenuDue = false;
  }
}
