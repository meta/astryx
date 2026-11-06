// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file transcriptDismiss.ts
 * @input The gesture system's pan recognizer, page hold and scroll test, the
 *   keyboard module's height, bringsUpKeyboard, the composer and the line
 *   where a drag dismisses
 * @output createKeyboardDismissPan and dismissKeyboardAtCrossing: a drag
 *   down a transcript dismisses the software keyboard as it reaches the
 *   composer. createComposerDismissPan and dismissKeyboardOnComposerDrag: a
 *   drag down that starts on the composer dismisses it.
 *   holdPageUnderComposer: a drag on the composer never scrolls the page
 *   under the keyboard.
 * @position Internal to Chat. ChatLayout attaches the transcript's pan to its
 *   root, with its composer's top as the line, and the composer's pan and
 *   page hold to its composer.
 *
 * SYNC: When modified, update /packages/core/src/Chat/ChatLayout.tsx
 */

import {PanGestureRecognizer} from '../gestures/PanGestureRecognizer';
import {canElementScroll, dragAxes} from '../gestures/nativeScroll';
import {holdPageScroll} from '../gestures/pageHold';
import type {GestureTouch} from '../gestures/types';
import {isPageZoomedIn} from '../hooks/scrollLockTouchGuard';
import {bringsUpKeyboard} from '../keyboard/keyboardLayoutGuide';
import {
  getKeyboardHeight,
  subscribeKeyboardHeight,
} from '../keyboard/keyboardHeight';
import {
  containsAlongFlatTree,
  deepActiveElement,
  parentAcrossShadow,
} from '../utils/flatTree';
import {isElement, isNode} from '../utils/nodeType';
import {UIKIT_LONG_PRESS} from '../motion/uikit/gestures';

/** What a transcript drag decides against, read as it starts. */
interface DismissDrag {
  readonly doc: Document;
  /** The line, as a `clientY`. */
  readonly line: number;
}

// The drag that each transcript pan follows, until it reaches the line or
// ends. A pan follows one drag at a time.
const drags = new WeakMap<PanGestureRecognizer, DismissDrag>();

/** What a drag that starts on the composer decides against. */
interface ComposerDrag {
  readonly doc: Document;
  readonly composer: Element;
  /** The node the contact began on. */
  readonly origin: Node;
}

// The drag that each composer pan follows, until it dismisses the keyboard,
// gives way to a scroller in the composer, or ends.
const composerDrags = new WeakMap<PanGestureRecognizer, ComposerDrag>();

/** The focused element, when it is one that brings up the keyboard. */
function focusedEditable(doc: Document): HTMLElement | null {
  const active = deepActiveElement(doc);
  return bringsUpKeyboard(active) ? (active as HTMLElement) : null;
}

/** The node that a contact began on, from any window. */
function nodeOf(target: unknown): Node | null {
  return isNode(target) ? target : null;
}

/**
 * The document of a contact on `node` while a software keyboard is up: a
 * field that brings up the keyboard has focus. A hardware keyboard on a touch
 * screen shows none. Null otherwise.
 */
function keyboardDocOf(node: Node | null): Document | null {
  const doc = node?.ownerDocument;
  const win = doc?.defaultView;
  if (doc == null || win == null || focusedEditable(doc) == null) {
    return null;
  }
  // 0 with no software keyboard up, and wherever nothing is measured.
  return getKeyboardHeight(win) > 0 ? doc : null;
}

/**
 * The drag to follow for a contact, or null. A software keyboard is up, and
 * the contact starts outside the focused field, above the line.
 */
function startsDismissDrag(
  touch: GestureTouch,
  dismissLine: () => number,
): DismissDrag | null {
  const node = nodeOf(touch.target);
  const doc = keyboardDocOf(node);
  if (node == null || doc == null || focusedEditable(doc)?.contains(node)) {
    return null;
  }
  const line = dismissLine();
  return touch.startY < line ? {doc, line} : null;
}

/** Whether the pan's drag is over: released, cancelled or failed. */
function isFinished(pan: PanGestureRecognizer): boolean {
  return (
    pan.state === 'ended' || pan.state === 'cancelled' || pan.state === 'failed'
  );
}

/**
 * A pan for a transcript: a drag down it dismisses the software keyboard as
 * it reaches the composer. Attach it to the transcript, with
 * `dismissKeyboardAtCrossing` as its action. It only watches: the drag
 * scrolls the transcript as before.
 *
 * A mouse never reaches the pan, so a mouse drag keeps the browser's text
 * selection and focus.
 *
 * @example
 * ```
 * useGestureRecognizer(
 *   transcriptRef,
 *   () => createKeyboardDismissPan(() => composer.getBoundingClientRect().top),
 *   pan => dismissKeyboardAtCrossing(pan, bounce),
 * );
 * ```
 */
export function createKeyboardDismissPan(
  dismissLine: () => number,
): PanGestureRecognizer {
  return new PanGestureRecognizer({
    name: 'keyboard-dismiss',
    claimsTouches: false,
    maximumNumberOfTouches: 1,
    allowedPointerTypes: ['touch', 'pen'],
    shouldReceiveTouch: (pan, touch) => {
      const drag = startsDismissDrag(touch, dismissLine);
      if (drag == null) {
        return false;
      }
      drags.set(pan, drag);
      return true;
    },
  });
}

/**
 * The action of a pan from `createKeyboardDismissPan`. The moment the finger
 * reaches the line, or lifts there, it blurs the focused field, once, and
 * calls `onDismiss` with the finger's downward speed (px/s). Only where the
 * finger is decides: a flick that lifts above the line keeps the keyboard,
 * however fast. Focus moves nowhere else.
 */
export function dismissKeyboardAtCrossing(
  pan: PanGestureRecognizer,
  onDismiss: (fingerSpeed: number) => void,
): void {
  const drag = drags.get(pan);
  if (drag == null) {
    return;
  }
  // The lift counts too: the finger can reach the line between its last move
  // and the lift.
  const isMoving =
    pan.state === 'began' || pan.state === 'changed' || pan.state === 'ended';
  const reachesLine = isMoving && pan.location().y >= drag.line;
  if (isFinished(pan) || reachesLine) {
    drags.delete(pan);
  }
  if (!reachesLine) {
    return;
  }
  const win = drag.doc.defaultView;
  const editable = focusedEditable(drag.doc);
  if (win == null || editable == null || getKeyboardHeight(win) <= 0) {
    return;
  }
  editable.blur();
  onDismiss(Math.max(0, pan.velocity().y));
}

/**
 * Whether a part of `composer` between it and `node` scrolls natively for a
 * pan of (`dx`, `dy`). Such a part is a long draft or a strip of attachments.
 */
function scrollsInComposer(
  node: Node,
  composer: Node,
  dx: number,
  dy: number,
): boolean {
  const axes = dragAxes(dx, dy);
  const x = axes.x ? dx : 0;
  const y = axes.y ? dy : 0;
  for (
    let at: Node | null = node;
    at != null && at !== composer;
    at = parentAcrossShadow(at)
  ) {
    if (isElement(at) && canElementScroll(at, x, y)) {
      return true;
    }
  }
  return false;
}

/**
 * A pan for the composer: a drag down that starts on it dismisses the
 * software keyboard, as a swipe down on Messages' input bar does. Attach it to
 * the composer, with `dismissKeyboardOnComposerDrag` as its action, and keep
 * the page still under the drag with `holdPageUnderComposer`.
 */
export function createComposerDismissPan(
  composer: () => Element | null,
): PanGestureRecognizer {
  return new PanGestureRecognizer({
    name: 'composer-keyboard-dismiss',
    claimsTouches: false,
    maximumNumberOfTouches: 1,
    allowedPointerTypes: ['touch', 'pen'],
    shouldReceiveTouch: (pan, touch) => {
      const origin = nodeOf(touch.target);
      const box = composer();
      const doc = keyboardDocOf(origin);
      if (
        origin == null ||
        box == null ||
        doc == null ||
        !containsAlongFlatTree(box, origin)
      ) {
        return false;
      }
      composerDrags.set(pan, {doc, composer: box, origin});
      return true;
    },
  });
}

/**
 * The action of a pan from `createComposerDismissPan`: once the drag moves
 * down, more down than across, it blurs the focused field, once. Focus moves
 * nowhere else. A part of the composer that scrolls for the drag keeps it. A
 * contact that held still for a long press keeps the keyboard. On iOS that
 * press opens the text loupe, and its drag moves the caret.
 */
export function dismissKeyboardOnComposerDrag(pan: PanGestureRecognizer): void {
  const drag = composerDrags.get(pan);
  if (drag == null) {
    return;
  }
  const touch = pan.trackedTouches[0];
  if (
    isFinished(pan) ||
    (pan.state === 'began' &&
      touch != null &&
      touch.time - touch.startTime >=
        UIKIT_LONG_PRESS.minimumPressDuration.value)
  ) {
    composerDrags.delete(pan);
    return;
  }
  if (pan.state !== 'began' && pan.state !== 'changed') {
    return;
  }
  const {x, y} = pan.translation();
  if (y <= 0 || y < Math.abs(x)) {
    return;
  }
  composerDrags.delete(pan);
  if (!scrollsInComposer(drag.origin, drag.composer, x, y)) {
    focusedEditable(drag.doc)?.blur();
  }
}

/**
 * Holds the page still under a one-finger drag that starts on `composer`
 * while a software keyboard is up, so content never scrolls under the
 * keyboard. It uses the gesture system's page hold, which leaves a second
 * finger and a touch a recognizer owns alone. A part of the composer that
 * scrolls for the drag, and a pinch-zoomed page, keep the drag. Returns a
 * function that releases the composer.
 */
export function holdPageUnderComposer(composer: HTMLElement): () => void {
  const doc = composer.ownerDocument;
  const win = doc.defaultView;
  if (win == null) {
    return () => {};
  }
  let release: (() => void) | null = null;
  const decide = (origin: EventTarget | null, dx: number, dy: number) =>
    isNode(origin) &&
    containsAlongFlatTree(composer, origin) &&
    !isPageZoomedIn(doc) &&
    !scrollsInComposer(origin, composer, dx, dy);
  // The hold listens only while a software keyboard is up.
  const follow = () => {
    const isUp = getKeyboardHeight(win) > 0;
    if (isUp && release == null) {
      release = holdPageScroll(doc, decide);
    } else if (!isUp && release != null) {
      release();
      release = null;
    }
  };
  const stopFollowing = subscribeKeyboardHeight(win, follow);
  follow();
  return () => {
    stopFollowing();
    release?.();
    release = null;
  };
}
