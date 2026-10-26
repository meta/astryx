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

import {isCoarsePointer} from './coarsePointer';
import {parentAcrossShadow} from './nativeScroll';

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
 * and only where the primary pointer is coarse (a phone, an iPad and its
 * pencil). Where the primary pointer is fine (a laptop's touchscreen, a
 * desktop pen tablet), a finger and a pen get the browser's defaults, as a
 * mouse does (`spec:AST-094` FR19, `spec:AST-017` FR59). A mouse never does.
 */
export function locksSelectionFor(
  pointerType: string,
  view: Window | null | undefined,
): boolean {
  return pointerType !== 'mouse' && isCoarsePointer(view);
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
