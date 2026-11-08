// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file chatComposerSelection.ts
 * @input Uses DOM Selection / Range APIs
 * @output Exports selection helpers used by the chat composer
 * @position Internal helper module shared by ChatComposerInput and useChatComposerTokens
 *
 * Selection helpers for the contentEditable chat input. Both the
 * imperative `insertToken` / `insertText` APIs and the paste pipeline
 * need a valid Range inside the editable before they can mutate the
 * DOM, and history recall needs to know where the caret sits.
 *
 * What a programmatic `focus()` does to the Selection is browser- and
 * state-dependent, and it is never what a click on the composer's padding
 * means. Measured in Chromium: focusing a contentEditable collapses the
 * caret to offset 0 — the *start* of the draft — whether or not a
 * selection existed before, and whether the editable is empty or not.
 * Other engines may instead leave no Range inside the editable at all.
 *
 * So the composer never infers the caret from a bare `focus()`:
 * - `placeCaretAtEnd` states the caret outright, and is what the composer
 *   shell's click-to-focus uses, because clicking the space after a draft
 *   means "put me after the text" in every chat composer.
 * - `getSelectionRangeInside` + `restoreSelectionRange` let the imperative
 *   `focus()` keep a caret or selection the user already had: it is read
 *   before focusing, since afterwards the engine's own caret is
 *   indistinguishable from theirs.
 * - `ensureCaretInside` is the weaker fallback for callers that only
 *   need *a* valid Range (paste, imperative insertion): it respects a
 *   caret that already exists and creates one at the end otherwise.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Chat/ChatComposerInput.tsx (consumer)
 * - /packages/core/src/Chat/useChatComposerTokens.ts (consumer)
 */

/**
 * The current Selection's range when it lies inside `editable`, or `null`.
 *
 * Callers use this to read the caret *before* focusing, because `focus()`
 * creates a caret of its own and afterwards the two are indistinguishable.
 * The range is cloned, so later DOM work cannot mutate the saved position.
 */
export function getSelectionRangeInside(editable: HTMLElement): Range | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }
  const range = selection.getRangeAt(0);
  if (
    !editable.contains(range.startContainer) ||
    !editable.contains(range.endContainer)
  ) {
    return null;
  }
  return range.cloneRange();
}

/** Make `range` the current Selection again. */
export function restoreSelectionRange(range: Range): void {
  const selection = window.getSelection();
  if (!selection) {
    return;
  }
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * Collapse the Selection to the very end of `editable`'s content,
 * replacing whatever the Selection held before.
 *
 * Unlike {@link ensureCaretInside} this is unconditional: a caret the
 * browser placed on `focus()` is overwritten, which is the point — that
 * caret lands at the start of the draft, where ArrowUp means "recall
 * history" and would discard what the user had typed.
 *
 * Returns `true` when the caret was placed, `false` if the Selection API
 * is unavailable (e.g. a detached document).
 */
export function placeCaretAtEnd(editable: HTMLElement): boolean {
  const selection = window.getSelection();
  if (!selection) {
    return false;
  }
  const range = document.createRange();
  range.selectNodeContents(editable);
  range.collapse(false); // collapse to end
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

/**
 * Ensure the current Selection has a Range inside `editable`.
 *
 * If `window.getSelection()` already has a Range whose `startContainer`
 * is inside `editable`, this is a no-op — including the start-of-draft
 * caret a `focus()` leaves behind, which is why callers that care where
 * the caret lands want {@link placeCaretAtEnd} instead. Otherwise a
 * collapsed caret is placed at the end of `editable`.
 *
 * Returns the live `Selection` on success, or `null` if no Selection
 * is available at all (e.g. detached document, JSDOM without selection
 * support).
 */
export function ensureCaretInside(editable: HTMLElement): Selection | null {
  const selection = window.getSelection();
  if (!selection) {
    return null;
  }

  if (selection.rangeCount > 0) {
    const existing = selection.getRangeAt(0);
    if (editable.contains(existing.startContainer)) {
      return selection;
    }
  }

  const range = document.createRange();
  range.selectNodeContents(editable);
  range.collapse(false); // collapse to end
  selection.removeAllRanges();
  selection.addRange(range);
  return selection;
}

/**
 * Whether the current selection's start boundary sits at the very
 * beginning of `editable`'s content.
 *
 * Used by the composer to decide when ArrowUp should recall message
 * history versus move the caret up a line: history is only recalled
 * when the caret is at the very start of the draft. This handles both
 * the editable root and offset 0 of its leading text node without
 * cloning the draft's contents.
 *
 * Returns `false` when there is no selection, the range is not inside
 * `editable`, or the boundary APIs are unavailable — callers treat
 * that as "not at the boundary" and let the browser move the caret.
 */
export function isSelectionAtStart(editable: HTMLElement): boolean {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return false;
  }
  const range = selection.getRangeAt(0);
  return isBoundaryAtEdge(
    editable,
    range.startContainer,
    range.startOffset,
    'start',
  );
}

/**
 * Whether the current selection's end boundary sits at the very end of
 * `editable`'s content.
 *
 * The ArrowDown counterpart to {@link isSelectionAtStart}: history is
 * only stepped forward when the caret is at the very end of the draft.
 *
 * Returns `false` under the same conditions as {@link isSelectionAtStart}.
 */
export function isSelectionAtEnd(editable: HTMLElement): boolean {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return false;
  }
  const range = selection.getRangeAt(0);
  return isBoundaryAtEdge(editable, range.endContainer, range.endOffset, 'end');
}

/**
 * Check whether a Range boundary is at an edge of `editable` without
 * materializing the content before or after it. Chromium represents a caret
 * at the start of non-empty contenteditables as the first text node at offset
 * zero (and likewise uses the last text node's length at the end). Those are
 * distinct DOM boundary points from the editable's child offsets, so
 * `compareBoundaryPoints` cannot be used here.
 */
function isBoundaryAtEdge(
  editable: HTMLElement,
  container: Node,
  offset: number,
  edge: 'start' | 'end',
): boolean {
  if (!editable.contains(container) || !isAtNodeEdge(container, offset, edge)) {
    return false;
  }

  for (let node: Node | null = container; node && node !== editable;) {
    if (hasContentSibling(node, edge)) {
      return false;
    }
    node = node.parentNode;
  }

  return true;
}

function isAtNodeEdge(
  node: Node,
  offset: number,
  edge: 'start' | 'end',
): boolean {
  if (
    node.nodeType === Node.TEXT_NODE ||
    node.nodeType === Node.CDATA_SECTION_NODE
  ) {
    return edge === 'start'
      ? offset === 0
      : offset === (node.nodeValue?.length ?? 0);
  }

  return edge === 'start' ? offset === 0 : offset === node.childNodes.length;
}

function hasContentSibling(node: Node, edge: 'start' | 'end'): boolean {
  for (
    let sibling = edge === 'start' ? node.previousSibling : node.nextSibling;
    sibling;
    sibling = edge === 'start' ? sibling.previousSibling : sibling.nextSibling
  ) {
    // Elements (including <br> and tokens) represent a content boundary even
    // when they have no text. Empty text nodes and comments do not.
    if (
      sibling.nodeType === Node.ELEMENT_NODE ||
      (sibling.nodeType === Node.TEXT_NODE && sibling.nodeValue !== '')
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Insert plain text at the current selection, scoped to `editable`.
 *
 * Ensures a caret exists inside `editable` first (see `ensureCaretInside`)
 * so callers don't have to manage Selection state to make insertion work
 * — e.g. after a programmatic focus that didn't create a Range.
 *
 * Returns `true` if text was inserted, `false` only if the Selection
 * API is unavailable.
 */
export function insertTextAtCursor(
  editable: HTMLElement,
  text: string,
): boolean {
  const selection = ensureCaretInside(editable);
  if (!selection || selection.rangeCount === 0) {
    return false;
  }

  const range = selection.getRangeAt(0);
  range.deleteContents();

  const textNode = document.createTextNode(text);
  range.insertNode(textNode);

  range.setStartAfter(textNode);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}
