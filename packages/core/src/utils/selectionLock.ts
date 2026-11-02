// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file selectionLock.ts
 * @input The elements a held touch contact presses, and the touch's target
 * @output lockSelection: no text selection and no touch callout under the
 *   held finger until the release runs; and locksSelectionFor: which contacts
 *   take it
 * @position Brought by the recognizers whose hold does something. The gesture
 *   host calls it and never imports it.
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
//   refcounted, because a lock on only the element under the finger let a
//   long press select a word beside it. WebKit makes every input selectable,
//   so an input under the finger is locked too.
// - Elsewhere, cancelling `selectstart` refuses the selection with no style
//   write, so nothing repaints.

import {containsAlongFlatTree} from './flatTree';
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

// A mouse keeps its released behavior (AST-017).
/**
 * Whether a contact of this pointer kind takes the lock: a finger or a pen,
 * under any primary pointer, a laptop's touchscreen and a desktop pen tablet
 * included, since a pen's hold acts as a finger's. A mouse never does: it
 * keeps its released behavior.
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
