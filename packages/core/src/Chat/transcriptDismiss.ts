// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file transcriptDismiss.ts
 * @input The gesture system's pan recognizer, the keyboard module's height,
 *   bringsUpKeyboard and the line where a release dismisses
 * @output createKeyboardDismissPan and dismissKeyboardAtRelease: a touch or
 *   pen drag down a transcript to its composer dismisses the software
 *   keyboard, as UIScrollView's interactive `keyboardDismissMode` does
 * @position Internal to Chat. ChatLayout attaches the pan to its root, with
 *   its composer's top as the line.
 *
 * SYNC: When modified, update /packages/core/src/Chat/ChatLayout.tsx
 */

import {PanGestureRecognizer} from '../gestures/PanGestureRecognizer';
import type {GestureTouch} from '../gestures/types';
import {bringsUpKeyboard} from '../keyboard/keyboardLayoutGuide';
import {getKeyboardHeight, isNodeTarget} from '../keyboard/keyboardHeight';
import {deepActiveElement} from '../utils/flatTree';

/** What a followed drag decides against, read as it starts. */
export interface DismissDrag {
  readonly doc: Document;
  /** The line, as a `clientY`. */
  readonly line: number;
  /** The keyboard's height as the drag starts: the composer's travel. */
  readonly travel: number;
}

// The drag that each pan follows. A pan follows one drag at a time.
const drags = new WeakMap<PanGestureRecognizer, DismissDrag>();

/** The focused element, when it is one that brings up the keyboard. */
function focusedEditable(doc: Document): HTMLElement | null {
  const active = deepActiveElement(doc);
  return bringsUpKeyboard(active) ? (active as HTMLElement) : null;
}

/** The node that a contact began on, from any window. */
function nodeOf(target: unknown): Node | null {
  return isNodeTarget(target as EventTarget | null) ? (target as Node) : null;
}

/**
 * The drag to follow for a contact, or null. A field that brings up the
 * keyboard has focus, and a software keyboard is up. A hardware keyboard on a
 * touch screen shows none. The contact starts outside the field, above the
 * line.
 */
function startsDismissDrag(
  touch: GestureTouch,
  dismissLine: () => number,
): DismissDrag | null {
  const node = nodeOf(touch.target);
  const doc = node?.ownerDocument;
  const win = doc?.defaultView;
  if (node == null || doc == null || win == null) {
    return null;
  }
  const editable = focusedEditable(doc);
  if (editable == null || editable.contains(node)) {
    return null;
  }
  // 0 with no software keyboard up, and wherever nothing is measured.
  const travel = getKeyboardHeight(win);
  if (travel <= 0) {
    return null;
  }
  const line = dismissLine();
  return touch.startY < line ? {doc, line, travel} : null;
}

/** Whether the pan's drag is over: released, cancelled or failed. */
function isFinished(pan: PanGestureRecognizer): boolean {
  return (
    pan.state === 'ended' || pan.state === 'cancelled' || pan.state === 'failed'
  );
}

/** The drag `pan` follows, from its start to its release; null otherwise. */
export function dismissDragOf(pan: PanGestureRecognizer): DismissDrag | null {
  return drags.get(pan) ?? null;
}

/**
 * A pan for a transcript: a drag down it dismisses the software keyboard, as
 * UIScrollView's interactive `keyboardDismissMode` does. Attach it to the
 * transcript, with `dismissKeyboardAtRelease` as its action.
 *
 * In UIKit the keyboard follows the finger down once the finger reaches its
 * top. A page cannot move the system keyboard, so the drag decides once,
 * when it ends. The keyboard goes if the drag ends at or past `dismissLine`,
 * the top of what sits on the keyboard. Otherwise it stays. Nothing projects
 * the release: a flick that ends above the line keeps the keyboard, however
 * fast. A release that moves back up keeps it, however far the drag went.
 *
 * A mouse never reaches the pan, so a mouse drag keeps the browser's text
 * selection and focus.
 *
 * @source measured: UIKit lab, iOS 26.2 simulator, Oct 25 2026, drags on a
 *   full-screen UIScrollView in `.interactive` mode. A field had focus, with
 *   and without a 50 pt accessory bar. The drags lifted above, at and into
 *   the input views, at rest, slowly, fast and moving back up. Nothing above
 *   the top dismissed, however fast. At or past it, every release dismissed,
 *   but one that moved up restored.
 *
 * @example
 * ```
 * useGestureRecognizer(
 *   transcriptRef,
 *   () => createKeyboardDismissPan(() => composer.getBoundingClientRect().top),
 *   dismissKeyboardAtRelease,
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
 * The action of a pan from `createKeyboardDismissPan`. When the drag ends at
 * or past its line, and does not move back up, it blurs the focused field.
 * Focus moves nowhere else.
 */
export function dismissKeyboardAtRelease(pan: PanGestureRecognizer): void {
  const drag = drags.get(pan);
  if (drag == null || !isFinished(pan)) {
    return;
  }
  drags.delete(pan);
  if (pan.state !== 'ended') {
    return;
  }
  const win = drag.doc.defaultView;
  if (win == null || getKeyboardHeight(win) <= 0 || pan.velocity().y < 0) {
    return;
  }
  // Where the drag lifts decides, with no projection.
  if (pan.location().y >= drag.line) {
    focusedEditable(drag.doc)?.blur();
  }
}
