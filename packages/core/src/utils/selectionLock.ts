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
import {subscribeInput} from './inputStream';
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
 * refused, and the selection is put back. A `selectstart` does not leave its
 * shadow tree. So the document refuses only one that starts outside every
 * shadow tree, and a claiming element inside one refuses its own. The
 * press's own `mouseup` and `click` come after its `pointerup` in the same
 * task, and WebKit settles the drag's selection there. So the document's
 * hold ends a task after a lift. A cancel ends it at once, because nothing
 * follows a cancel. `onReleased` runs once the document's hold has ended.
 * The page listeners exist only during a press. Idempotent.
 */
export function lockDragSelection(
  elements: Iterable<Element>,
  view: Window | null | undefined,
  kept: ReadonlyArray<AbstractRange>,
  onReleased?: () => void,
): (options?: DragSelectionReleaseOptions) => void {
  const doc = view?.document ?? null;
  const roots = shadowRootsOfRanges(kept);
  const restore = () => {
    const selection = view?.getSelection();
    // The focused field keeps its own selection (a drag never starts in one).
    if (selection == null || isTextEntry(deepActiveElement(doc))) {
      return;
    }
    const held = heldRanges(selection, roots);
    if (kept.length === 0) {
      if (held.some(range => !range.collapsed)) {
        selection.removeAllRanges();
      }
      return;
    }
    // A render can remove what the kept selection held: then there is
    // nothing to put back.
    if (sameRanges(held, kept) || !kept.every(isValidRange)) {
      return;
    }
    selectRanges(selection, kept);
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
  const stopDocument =
    view == null
      ? []
      : [
          subscribeInput(view, 'selectstart', refuse, {cancels: true}),
          subscribeInput(view, 'selectionchange', restore),
        ];
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
    try {
      restore();
    } finally {
      for (const stop of stopDocument) {
        stop();
      }
      onReleased?.();
    }
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
): ReadonlyArray<AbstractRange> {
  const selection = view?.getSelection();
  if (selection == null) {
    return [];
  }
  const composed = composedRangesOf(selection, []);
  if (composed != null) {
    return composed.filter(range => !range.collapsed).map(liveWhereItCan);
  }
  if (selection.isCollapsed) {
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
 * because the engine starts no selection from a drag inside a button. A point
 * beside text, which a caret query snaps to the nearest character, lands on
 * none. Where the engine has no caret query, nothing is selectable text.
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
  const caret = caretAt(doc, x, y, [
    ...ownShadowRoot(target),
    ...openShadowRootsOf(target),
  ]);
  if (caret == null) {
    return false;
  }
  const {node, offset} = caret;
  if (node.nodeType !== 3 || (node.textContent ?? '').trim() === '') {
    return false;
  }
  // Text directly under a shadow root takes its host's style.
  const element =
    node.parentElement ??
    (node.parentNode?.nodeType === 11
      ? (node.parentNode as ShadowRoot).host
      : null);
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
  shadowRoots: ReadonlyArray<ShadowRoot>,
): {node: Node; offset: number} | null {
  const queries = doc as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number,
      options?: {shadowRoots?: ShadowRoot[]},
    ) => {offsetNode: Node; offset: number} | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  if (typeof queries.caretPositionFromPoint === 'function') {
    // Without the roots, a point over shadow text answers at its host.
    const position =
      shadowRoots.length > 0
        ? queries.caretPositionFromPoint(x, y, {
            shadowRoots: [...shadowRoots],
          })
        : queries.caretPositionFromPoint(x, y);
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

/**
 * The ranges `selection` holds, with boundaries inside `shadowRoots` where the
 * engine reads composed ranges.
 */
function heldRanges(
  selection: Selection,
  shadowRoots: ReadonlyArray<ShadowRoot>,
): ReadonlyArray<AbstractRange> {
  const composed = composedRangesOf(selection, shadowRoots);
  if (composed != null) {
    return composed;
  }
  const ranges: Range[] = [];
  for (let index = 0; index < selection.rangeCount; index++) {
    ranges.push(selection.getRangeAt(index));
  }
  return ranges;
}

/**
 * A live copy of `range` when both boundaries share a root, so it follows
 * DOM changes. A range across roots stays static: no live range holds it.
 */
function liveWhereItCan(range: StaticRange): AbstractRange {
  const live = range.startContainer.ownerDocument?.createRange();
  if (
    live == null ||
    range.startContainer.getRootNode() !== range.endContainer.getRootNode()
  ) {
    return range;
  }
  live.setStart(range.startContainer, range.startOffset);
  live.setEnd(range.endContainer, range.endOffset);
  return live;
}

/** Whether both of `range`'s boundaries still exist in the document. */
function isValidRange(range: AbstractRange): boolean {
  return (
    isValidBoundary(range.startContainer, range.startOffset) &&
    isValidBoundary(range.endContainer, range.endOffset)
  );
}

function isValidBoundary(node: Node, offset: number): boolean {
  const length =
    node.nodeType === 3 || node.nodeType === 4 || node.nodeType === 8
      ? (node as CharacterData).length
      : node.childNodes.length;
  return node.isConnected && offset >= 0 && offset <= length;
}

/** Whether two range lists have the same boundaries, in order. */
function sameRanges(
  held: ReadonlyArray<AbstractRange>,
  kept: ReadonlyArray<AbstractRange>,
): boolean {
  return (
    held.length === kept.length &&
    kept.every((range, index) => {
      const other = held[index];
      return (
        other.startContainer === range.startContainer &&
        other.startOffset === range.startOffset &&
        other.endContainer === range.endContainer &&
        other.endOffset === range.endOffset
      );
    })
  );
}

/**
 * Put `ranges` back as the selection. One range goes through
 * `setBaseAndExtent`, which also reaches inside a shadow root.
 */
function selectRanges(
  selection: Selection,
  ranges: ReadonlyArray<AbstractRange>,
): void {
  const [only] = ranges;
  if (ranges.length === 1 && typeof selection.setBaseAndExtent === 'function') {
    selection.setBaseAndExtent(
      only.startContainer,
      only.startOffset,
      only.endContainer,
      only.endOffset,
    );
    return;
  }
  selection.removeAllRanges();
  for (const range of ranges) {
    const copy = range.startContainer.ownerDocument?.createRange();
    if (copy == null) {
      continue;
    }
    copy.setStart(range.startContainer, range.startOffset);
    copy.setEnd(range.endContainer, range.endOffset);
    selection.addRange(copy);
  }
}

/**
 * The selection's composed ranges, reaching into each open shadow root a
 * boundary lands on; null where the engine has no `getComposedRanges`.
 * Without the roots, a selection inside a shadow root reads as one around
 * its host.
 */
function composedRangesOf(
  selection: Selection,
  known: ReadonlyArray<ShadowRoot>,
): StaticRange[] | null {
  const query = (
    selection as Selection & {
      getComposedRanges?: (options?: {
        shadowRoots?: ShadowRoot[];
      }) => StaticRange[];
    }
  ).getComposedRanges;
  if (typeof query !== 'function') {
    return null;
  }
  // Engines take the roots as a dictionary, or, in older releases, as
  // arguments.
  const read = (roots: ShadowRoot[]): StaticRange[] | null => {
    try {
      return query.call(selection, {shadowRoots: roots});
    } catch {
      try {
        return (query as (...roots: ShadowRoot[]) => StaticRange[]).call(
          selection,
          ...roots,
        );
      } catch {
        return null;
      }
    }
  };
  const roots = [...known];
  for (;;) {
    const ranges = read([...roots]);
    if (ranges == null) {
      return null;
    }
    const found = new Set<ShadowRoot>();
    for (const range of ranges) {
      for (const [node, offset] of [
        [range.startContainer, range.startOffset],
        [range.endContainer, range.endOffset],
      ] as const) {
        for (const child of [
          node.childNodes[offset],
          node.childNodes[offset - 1],
        ]) {
          const root =
            child?.nodeType === 1 ? (child as Element).shadowRoot : null;
          if (root != null && !roots.includes(root)) {
            found.add(root);
          }
        }
      }
    }
    if (found.size === 0) {
      return ranges;
    }
    roots.push(...found);
  }
}

/** The open shadow roots on the root chains of `ranges`' boundaries. */
function shadowRootsOfRanges(
  ranges: ReadonlyArray<AbstractRange>,
): ReadonlyArray<ShadowRoot> {
  const roots = new Set<ShadowRoot>();
  for (const range of ranges) {
    for (const root of [
      ...openShadowRootsOf(range.startContainer),
      ...openShadowRootsOf(range.endContainer),
    ]) {
      roots.add(root);
    }
  }
  return [...roots];
}

/**
 * The open shadow root `target` hosts, if any. A press on text directly under
 * a shadow root targets its host.
 */
function ownShadowRoot(target: EventTarget | null): ShadowRoot[] {
  const root =
    (target as Node | null)?.nodeType === 1
      ? (target as Element).shadowRoot
      : null;
  return root == null ? [] : [root];
}

/** The open shadow roots on `target`'s root chain, innermost first. */
function openShadowRootsOf(target: EventTarget | null): ShadowRoot[] {
  const roots: ShadowRoot[] = [];
  let root =
    target != null && typeof (target as Node).nodeType === 'number'
      ? (target as Node).getRootNode()
      : null;
  while (root != null && root.nodeType === 11) {
    const host = (root as ShadowRoot).host as Element | undefined;
    if (host == null) {
      break;
    }
    if ((root as ShadowRoot).mode === 'open') {
      roots.push(root as ShadowRoot);
    }
    root = host.getRootNode();
  }
  return roots;
}

/** The focused element, inside open shadow roots too. */
function deepActiveElement(doc: Document | null): Element | null {
  let active = doc?.activeElement ?? null;
  while (active?.shadowRoot?.activeElement != null) {
    active = active.shadowRoot.activeElement;
  }
  return active;
}

/**
 * The selection-lock styles on `set`, refcounted per element; idempotent
 * release.
 */
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
