// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file selectionLock.ts
 * @input The elements a held touch contact presses, and the touch's target
 * @output Exports lockSelection: text selection and the touch callout off,
 *   inline and refcounted, until the returned release runs
 * @position Shared by the gesture host (press consumers, and recognizers
 *   that set `preventsTextSelection`) and the document press controller
 *   (utils/pressFeedback.ts), so every press on a coarse pointer gets it
 *
 * A UIKit control or cell never starts a selection under a held finger.
 * WebKit's own stylesheet makes every input selectable
 * (`-webkit-user-select: text`), out of reach of an ancestor's lock: a
 * checkbox, a radio or a switch's input under the finger inside a locked
 * element is locked too (iOS 26.2: its hold otherwise opens the loupe). A
 * text field keeps its selection: a held finger places its caret.
 *
 * SYNC: When modified, update GestureHost.ts and utils/pressFeedback.ts.
 */

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

/** Locked elements, how many contacts hold each, and what to restore. */
const locks = new WeakMap<
  Element,
  {
    count: number;
    saved: ReadonlyArray<{name: string; value: string; priority: string}>;
  }
>();

/**
 * Turn text selection and the touch callout off on `elements` (and on a
 * non-text input target inside one of them) until the returned function
 * runs; restored when the last holder releases. Idempotent release.
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
