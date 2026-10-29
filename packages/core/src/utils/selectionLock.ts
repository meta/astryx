// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file selectionLock.ts
 * @input The elements a held touch contact presses, and the touch's target
 * @output Exports lockSelection: no text selection and no touch callout
 *   start under the held finger until the returned release runs; and
 *   locksSelectionFor: which contacts take it
 * @position Brought by the recognizers whose hold does something (a long
 *   press, and a recognizer created with `selectionLock: lockSelection`); the
 *   gesture host calls it and never imports it (`spec:AST-094` FR41)
 *
 * A hold that does something never starts a selection or the callout under
 * the finger, a link's menu and preview included (`spec:AST-094` FR41,
 * DEC-9). A text field keeps its selection: a held finger places its caret.
 * How it is refused differs by engine, because a style change repaints
 * everything it covers:
 * - Where iOS WebKit runs (its touch callout query), only `user-select` refuses
 *   a long-press selection: WebKit fires no `selectstart` for one. It covers
 *   every held element, inline and refcounted: on the element under the
 *   finger alone, a long press selected a word beside it (iOS 26.2
 *   simulator). WebKit's own stylesheet makes every input selectable
 *   (`-webkit-user-select: text`), out of reach of an ancestor's lock, so a
 *   checkbox, a radio or a switch's input under the finger is locked too.
 * - Elsewhere a long press fires `selectstart`, and cancelling it refuses
 *   the selection with no style write, so nothing repaints (Chromium on
 *   Android re-rastered a held surface at the touch-down and the lift when
 *   the style toggled).
 *
 * SYNC: When modified, update GestureHost.ts and utils/pressFeedback.ts; the
 * iOS query matches utils/touchPresentation.ts.
 */

import {parentAcrossShadow} from './flatTree';

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
 * included, since a pen's hold acts as a finger's (`spec:AST-094` FR41). A
 * mouse never does: it keeps its released behavior (`spec:AST-017` FR59).
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
    [...set].some(element => isWithin(target, element))
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

/** How a drag's selection hold begins. */
export interface DragSelectionLockOptions {
  /**
   * The press claimed at its own pointerdown, before any movement (an action
   * group's press): it has selected nothing, so the page's selection stays.
   * The hold still refuses a new one, and puts the page's back over any
   * selection that appears while it runs.
   */
  keepsSelection?: boolean;
}

/** How a drag's selection hold ends: at a lift, or at a cancel. */
export interface DragSelectionReleaseOptions {
  /**
   * The press was cancelled (a pointercancel, a blur, a detach): no mouseup
   * or click follows.
   */
  isCancel?: boolean;
}

/**
 * Refuse a selection while a mouse or a pen drag a recognizer claimed runs,
 * until the returned function runs (`spec:AST-094` FR43, FR41). A drag that
 * moved before it claims has already started selecting, so that selection
 * goes first; a press that claims at its own pointerdown keeps the page's
 * (`keepsSelection`).
 * `elements` refuse one with inline styles, on every engine. The document
 * refuses one too, as WebKit extends a drag's selection over text outside
 * the elements without another `selectstart`: a `selectstart` anywhere is
 * refused and a selection the drag extends is cleared. The press's own
 * `mouseup` and `click` come after its `pointerup` in the same task, and
 * WebKit settles the drag's selection there, so the document's hold ends a
 * task after a lift; a cancel, which nothing follows, ends it at once. Page
 * listeners only during a press (FR24).
 * Idempotent release.
 */
export function lockDragSelection(
  elements: Iterable<Element>,
  view: Window | null | undefined,
  {keepsSelection = false}: DragSelectionLockOptions = {},
): (options?: DragSelectionReleaseOptions) => void {
  const kept = keepsSelection ? rangesOf(view?.getSelection()) : [];
  const clear = () => {
    const selection = view?.getSelection();
    if (
      selection == null ||
      selection.rangeCount === 0 ||
      selection.isCollapsed ||
      holdsRanges(selection, kept)
    ) {
      return;
    }
    selection.removeAllRanges();
    for (const range of kept) {
      selection.addRange(range.cloneRange());
    }
  };
  if (!keepsSelection) {
    view?.getSelection()?.removeAllRanges();
  }
  const set = new Set(elements);
  const refuse = (event: Event) => {
    if (!isTextEntry(event.target)) {
      event.preventDefault();
    }
  };
  for (const element of set) {
    element.addEventListener('selectstart', refuse);
  }
  const doc = view?.document ?? null;
  // The focused field keeps its own selection (a drag never starts in one).
  const clearOutsideEntry = () => {
    if (!isTextEntry(doc?.activeElement ?? null)) {
      clear();
    }
  };
  doc?.addEventListener('selectstart', refuse, true);
  doc?.addEventListener('selectionchange', clearOutsideEntry);
  const unlockStyles = lockStyles(set);
  let isReleased = false;
  return ({isCancel = false}: DragSelectionReleaseOptions = {}) => {
    if (isReleased) {
      return;
    }
    isReleased = true;
    for (const element of set) {
      element.removeEventListener('selectstart', refuse);
    }
    unlockStyles();
    const release = () => {
      clearOutsideEntry();
      doc?.removeEventListener('selectstart', refuse, true);
      doc?.removeEventListener('selectionchange', clearOutsideEntry);
    };
    // A lift's own mouseup and click follow in its task and must still meet
    // the hold; nothing follows a cancel, which lifts it at once (FR41).
    if (view == null || isCancel) {
      release();
    } else {
      view.setTimeout(release, 0);
    }
  };
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

/**
 * The query only iOS WebKit answers: it alone has the touch callout. The
 * same as utils/touchPresentation.ts's IOS_SUPPORTS_QUERY, kept here so the
 * gesture modules import nothing from React.
 */
const IOS_SUPPORTS_QUERY = '(-webkit-touch-callout: none)';

/** Whether the engine is iOS WebKit. */
function isIosWebKit(): boolean {
  // Not every environment has `CSS.supports` (jsdom has `CSS.escape` only).
  return (
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    CSS.supports(IOS_SUPPORTS_QUERY)
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

/** Whether `node` is `ancestor` or inside it, across shadow roots. */
function isWithin(node: Node, ancestor: Element): boolean {
  for (
    let current: Node | null = node;
    current != null;
    current = parentAcrossShadow(current)
  ) {
    if (current === ancestor) {
      return true;
    }
  }
  return false;
}

/** An element's inline style, when it has one (HTML and SVG elements). */
function styleOf(element: Element): CSSStyleDeclaration | null {
  const style = (element as Partial<ElementCSSInlineStyle>).style;
  return style instanceof Object ? style : null;
}

/** A selection's ranges, copied; none for a collapsed or empty one. */
function rangesOf(selection: Selection | null | undefined): Range[] {
  if (selection == null || selection.isCollapsed) {
    return [];
  }
  const ranges: Range[] = [];
  for (let index = 0; index < selection.rangeCount; index++) {
    ranges.push(selection.getRangeAt(index).cloneRange());
  }
  return ranges;
}

/** Whether `selection` holds exactly `ranges`, in order. */
function holdsRanges(
  selection: Selection,
  ranges: ReadonlyArray<Range>,
): boolean {
  if (ranges.length === 0 || selection.rangeCount !== ranges.length) {
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
