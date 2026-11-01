// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file sheetSelectionLock.ts
 * @input The elements a finger holds (the sheet) and the touch's target
 * @output Exports lockSheetSelection: no text selection starts under a
 *   finger holding the sheet until the returned release runs (idempotent)
 * @position BottomSheet's selection lock under a finger (useSheetGestures),
 *   in the shape of the gesture system's lockSelection
 *   (gestures/selectionLock.ts), which takes the same split
 *
 * The answer is the same on every engine: a finger held still on a caught
 * sheet starts no selection, no loupe and no callout. How it is refused
 * differs, because a style change repaints everything it covers:
 * - Where iOS WebKit runs (IOS_SUPPORTS_QUERY), only `user-select` refuses a
 *   long-press selection: WebKit fires no `selectstart` for one. It covers
 *   the whole sheet: on the element under the finger alone, the long press
 *   selected a word beside it (iOS 26.2 simulator, 4 of 4 takes).
 * - Elsewhere the long press fires `selectstart`, and cancelling it refuses
 *   the selection with no style change, so nothing repaints (Chromium on
 *   Android, measured on the emulator: the toggle re-rastered the sheet at
 *   the touch-down and at the lift).
 *
 * SYNC: When modified, check gestures/selectionLock.ts.
 */

import {lockSelection} from '../gestures/selectionLock';
import {IOS_SUPPORTS_QUERY} from '../utils/touchPresentation';

/** Inputs whose text a held finger edits (gestures/selectionLock.ts). */
const TEXT_ENTRY_TYPES = new Set([
  'text',
  'search',
  'email',
  'url',
  'tel',
  'password',
  'number',
]);

/**
 * A text field keeps its selection under a held finger, as in the gesture
 * system's lock: the finger places its caret there.
 */
function isTextEntry(node: EventTarget | null): boolean {
  const element =
    node instanceof Element
      ? node
      : node instanceof Node
        ? node.parentElement
        : null;
  if (element == null) {
    return false;
  }
  if (element.localName === 'textarea') {
    return true;
  }
  if (element.localName === 'input') {
    return TEXT_ENTRY_TYPES.has((element as HTMLInputElement).type);
  }
  return (element as HTMLElement).isContentEditable;
}

/** Whether the engine is iOS WebKit (the only one with the touch callout). */
function isIosWebKit(): boolean {
  // Not every environment has `CSS.supports` (jsdom has `CSS.escape` only).
  return (
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    CSS.supports(IOS_SUPPORTS_QUERY)
  );
}

export function lockSheetSelection(
  elements: Iterable<Element>,
  target: EventTarget | null,
): () => void {
  const held = [...elements];
  if (isIosWebKit()) {
    return lockSelection(held, target);
  }
  const refuse = (event: Event) => {
    if (!isTextEntry(event.target)) {
      event.preventDefault();
    }
  };
  for (const element of held) {
    element.addEventListener('selectstart', refuse);
  }
  let isReleased = false;
  return () => {
    if (isReleased) {
      return;
    }
    isReleased = true;
    for (const element of held) {
      element.removeEventListener('selectstart', refuse);
    }
  };
}
