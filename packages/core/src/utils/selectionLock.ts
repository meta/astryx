// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file selectionLock.ts
 * @input The elements a held touch contact presses, and the touch's target
 * @output lockSelection and locksSelectionFor give a held finger's lock.
 *   lockDragSelection gives a claimed mouse or pen drag's hold, which keeps
 *   the page's selection. startsOnSelectableText and selectionRangesOf are
 *   what a mouse or pen press reads.
 * @position Recognizers whose hold does something bring lockSelection; the
 *   gesture host imports the drag hold and the press reads.
 *
 * SYNC: When modified, update GestureHost.ts and utils/pressFeedback.ts; the
 * iOS query matches utils/touchPresentation.ts.
 */

// A hold that does something never starts a selection or the callout under
// the finger (AST-094). A text field keeps its selection, because a held
// finger places its caret. A style change repaints what it covers, so the
// way to refuse differs by engine:
// - iOS WebKit fires no `selectstart` for a long press, so only
//   `user-select` refuses it. The lock covers every held element, inline and
//   refcounted. A lock on only the element under the finger let a long press
//   select a word beside it. WebKit makes every input selectable, so an input
//   under the finger is locked too.
// - Elsewhere, cancelling `selectstart` refuses the selection with no style
//   write, so nothing repaints.
//
// A mouse never takes the lock, so its released behavior stays (AST-017).

import {containsAlongFlatTree, parentAcrossShadow} from './flatTree';
import {isIosWebKit} from './touchQueries';

/** What a held finger must not start on a control or a cell. */
const SELECTION_LOCK = [
  '-webkit-touch-callout',
  '-webkit-user-select',
  'user-select',
] as const;

/** Inputs whose text a held finger edits: it places the caret there. */
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
 * Whether a contact of this pointer kind takes the lock: a finger or a pen,
 * under any primary pointer, a laptop's touchscreen and a desktop pen tablet
 * included, since a pen's hold acts as a finger's.
 */
export function locksSelectionFor(pointerType: string): boolean {
  return pointerType !== 'mouse';
}

/** Locked elements, how many contacts hold each, and what to restore. */
const locks = new WeakMap<
  Element,
  {
    count: number;
    saved: ReadonlyArray<{name: string; value: string; priority: string}>;
  }
>();

/**
 * Refuse a selection and the touch callout on `elements` (and on a non-text
 * input target inside one of them) until the returned function runs, while
 * any holder holds. Idempotent release.
 */
export function lockSelection(
  elements: Iterable<Element>,
  target: EventTarget | null,
): () => void {
  const set = new Set(elements);
  if (
    isSelectableControl(target) &&
    [...set].some(element => containsAlongFlatTree(element, target))
  ) {
    set.add(target);
  }
  if (!isIosWebKit()) {
    const refuse = (event: Event) => {
      if (!isTextEntry(event.target)) {
        event.preventDefault();
      }
    };
    for (const element of set) {
      element.addEventListener('selectstart', refuse);
    }
    let isRefusing = true;
    return () => {
      if (isRefusing) {
        isRefusing = false;
        for (const element of set) {
          element.removeEventListener('selectstart', refuse);
        }
      }
    };
  }
  return lockStyles(set);
}

/** How a drag's selection hold ends: at a lift, or at a cancel. */
export interface DragSelectionReleaseOptions {
  /**
   * The press was cancelled (a pointercancel, a blur, a detach), so no
   * mouseup or click follows: the hold ends at once. Called again after a
   * lift, it ends the hold's last task at once too.
   */
  isCancel?: boolean;
}

/**
 * Refuse a new selection while a mouse or pen drag that a recognizer claimed
 * runs, until the returned function runs. `kept` is the page's selection
 * when the press began, and it stays. Anything that replaces it while the
 * drag runs is put back to it. That includes the press's own collapse and a
 * selection the drag started before its claim. So the drag takes no new
 * selection and never clears an existing one. `elements` refuse a
 * selection with inline styles, on every engine. The document refuses one
 * too, because WebKit extends a drag's selection over text outside the
 * elements without another `selectstart`. So a `selectstart` anywhere is
 * refused, and the selection is put back. The press's own `mouseup` and
 * `click` come after its `pointerup` in the same task, and WebKit settles
 * the drag's selection there. So the document's hold ends a task after a
 * lift. A cancel ends it at once, because nothing follows a cancel.
 * `onReleased` runs once the document's hold has ended. The page listeners
 * exist only during a press. Idempotent.
 */
export function lockDragSelection(
  elements: Iterable<Element>,
  view: Window | null | undefined,
  kept: ReadonlyArray<Range>,
  onReleased?: () => void,
): (options?: DragSelectionReleaseOptions) => void {
  const doc = view?.document ?? null;
  const restore = () => {
    const selection = view?.getSelection();
    // The focused field keeps its own selection (a drag never starts in one).
    if (selection == null || isTextEntry(doc?.activeElement ?? null)) {
      return;
    }
    if (kept.length === 0) {
      if (selection.rangeCount > 0 && !selection.isCollapsed) {
        selection.removeAllRanges();
      }
      return;
    }
    if (holdsRanges(selection, kept)) {
      return;
    }
    selection.removeAllRanges();
    for (const range of kept) {
      selection.addRange(range.cloneRange());
    }
  };
  restore();
  const set = new Set(elements);
  const refuse = (event: Event) => {
    if (!isTextEntry(event.target)) {
      event.preventDefault();
    }
  };
  for (const element of set) {
    element.addEventListener('selectstart', refuse);
  }
  doc?.addEventListener('selectstart', refuse, true);
  doc?.addEventListener('selectionchange', restore);
  const unlockStyles = lockStyles(set);
  let stage: 'held' | 'lifted' | 'done' = 'held';
  let timer: number | null = null;
  const releaseDocument = () => {
    if (stage === 'done') {
      return;
    }
    stage = 'done';
    if (timer != null) {
      view?.clearTimeout(timer);
      timer = null;
    }
    restore();
    doc?.removeEventListener('selectstart', refuse, true);
    doc?.removeEventListener('selectionchange', restore);
    onReleased?.();
  };
  return ({isCancel = false}: DragSelectionReleaseOptions = {}) => {
    if (stage === 'held') {
      stage = 'lifted';
      for (const element of set) {
        element.removeEventListener('selectstart', refuse);
      }
      unlockStyles();
      // A lift's own mouseup and click follow in its task and must still
      // meet the hold; nothing follows a cancel, which ends it at once.
      if (view == null || isCancel) {
        releaseDocument();
      } else {
        timer = view.setTimeout(releaseDocument, 0);
      }
    } else if (stage === 'lifted' && isCancel) {
      releaseDocument();
    }
  };
}

/**
 * The page's selection now, its ranges copied; none for a collapsed or empty
 * one. A drag's hold keeps what this read when the press began.
 */
export function selectionRangesOf(
  view: Window | null | undefined,
): ReadonlyArray<Range> {
  const selection = view?.getSelection();
  if (selection == null || selection.isCollapsed) {
    return [];
  }
  const ranges: Range[] = [];
  for (let index = 0; index < selection.rangeCount; index++) {
    ranges.push(selection.getRangeAt(index).cloneRange());
  }
  return ranges;
}

/**
 * Whether a press at (`x`, `y`) lands on text a drag would select. That is a
 * text field, or a character of non-empty text whose element allows a
 * selection. A native button's label, slotted or not, is not selectable text,
 * because the engine starts no selection from a drag inside a button. A point beside text, which a
 * caret query snaps to the nearest character, lands on none. Where the engine
 * has no caret query, nothing is selectable text.
 */
export function startsOnSelectableText(
  doc: Document,
  x: number,
  y: number,
  target: EventTarget | null,
): boolean {
  if (isTextEntry(target)) {
    return true;
  }
  const caret = caretAt(doc, x, y);
  if (caret == null) {
    return false;
  }
  const {node, offset} = caret;
  if (node.nodeType !== 3 || (node.textContent ?? '').trim() === '') {
    return false;
  }
  const element = node.parentElement;
  if (element == null || !allowsSelection(element) || isInButton(node)) {
    return false;
  }
  const length = (node.textContent ?? '').length;
  const range = doc.createRange();
  if (typeof range.getClientRects !== 'function') {
    return false;
  }
  for (const start of [offset - 1, offset]) {
    if (start < 0 || start >= length) {
      continue;
    }
    range.setStart(node, start);
    range.setEnd(node, start + 1);
    for (const rect of Array.from(range.getClientRects())) {
      if (
        x >= rect.left &&
        x <= rect.right &&
        y >= rect.top &&
        y <= rect.bottom
      ) {
        return true;
      }
    }
  }
  return false;
}

/** Whether `node` is inside a native button, along the flat tree. */
function isInButton(node: Node): boolean {
  for (let at: Node | null = node; at != null; at = parentAcrossShadow(at)) {
    if (at.nodeType === 1 && (at as Element).localName === 'button') {
      return true;
    }
  }
  return false;
}

/** The caret position the engine puts at a point, by either query. */
function caretAt(
  doc: Document,
  x: number,
  y: number,
): {node: Node; offset: number} | null {
  const queries = doc as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => {offsetNode: Node; offset: number} | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  if (typeof queries.caretPositionFromPoint === 'function') {
    const position = queries.caretPositionFromPoint(x, y);
    return position == null
      ? null
      : {node: position.offsetNode, offset: position.offset};
  }
  if (typeof queries.caretRangeFromPoint === 'function') {
    const range = queries.caretRangeFromPoint(x, y);
    return range == null
      ? null
      : {node: range.startContainer, offset: range.startOffset};
  }
  return null;
}

/** Whether an element's text can be selected (`user-select` is not none). */
function allowsSelection(element: Element): boolean {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (style == null) {
    return false;
  }
  return (
    style.getPropertyValue('user-select') !== 'none' &&
    style.getPropertyValue('-webkit-user-select') !== 'none'
  );
}

/** Whether `selection` holds exactly `ranges`, in order. */
function holdsRanges(
  selection: Selection,
  ranges: ReadonlyArray<Range>,
): boolean {
  if (selection.rangeCount !== ranges.length) {
    return false;
  }
  return ranges.every((range, index) => {
    const held = selection.getRangeAt(index);
    return (
      held.startContainer === range.startContainer &&
      held.startOffset === range.startOffset &&
      held.endContainer === range.endContainer &&
      held.endOffset === range.endOffset
    );
  });
}

/** The selection-lock styles on `set`, refcounted per element; idempotent release. */
function lockStyles(set: ReadonlySet<Element>): () => void {
  const locked: Element[] = [];
  for (const element of set) {
    const style = styleOf(element);
    if (style == null) {
      continue;
    }
    locked.push(element);
    const lock = locks.get(element);
    if (lock != null) {
      lock.count += 1;
      continue;
    }
    locks.set(element, {
      count: 1,
      saved: SELECTION_LOCK.map(name => ({
        name,
        value: style.getPropertyValue(name),
        priority: style.getPropertyPriority(name),
      })),
    });
    for (const name of SELECTION_LOCK) {
      style.setProperty(name, 'none');
    }
  }
  let isReleased = false;
  return () => {
    if (isReleased) {
      return;
    }
    isReleased = true;
    for (const element of locked) {
      const lock = locks.get(element);
      if (lock == null || --lock.count > 0) {
        continue;
      }
      locks.delete(element);
      const style = styleOf(element);
      for (const {name, value, priority} of lock.saved) {
        if (value === '') {
          style?.removeProperty(name);
        } else {
          style?.setProperty(name, value, priority);
        }
      }
    }
  };
}

/**
 * A form control WebKit's own stylesheet makes selectable, which no
 * ancestor's lock reaches: every input that is not a text field.
 */
function isSelectableControl(node: unknown): node is HTMLInputElement {
  return (
    node instanceof Element &&
    node.localName === 'input' &&
    !TEXT_ENTRY_TYPES.has((node as HTMLInputElement).type)
  );
}

/** Text a held finger edits: it places the caret there. */
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

/** An element's inline style, when it has one (HTML and SVG elements). */
function styleOf(element: Element): CSSStyleDeclaration | null {
  const style = (element as Partial<ElementCSSInlineStyle>).style;
  return style instanceof Object ? style : null;
}
