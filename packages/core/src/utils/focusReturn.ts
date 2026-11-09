// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file focusReturn.ts
 * @input The document's current active element and the shared interaction
 *   modality.
 * @output Whether focus would be lost if a surface hid now; a focus move whose
 *   ring follows the last input; the focus return of a closed overlay, which
 *   never scrolls the page; and the one path that moves focus out of content a
 *   change removed or hid (`noteFocusWithin`, `moveFocusLeftBehind`).
 * @position Utility; used by overlays (BottomSheet, Dialog, DropdownMenu) that
 *   move focus programmatically, and by disclosures that hide focused
 *   content. isFocusDetached lives in isFocusDetached.ts, so the utils entry,
 *   which exports only it, does not reach this module.
 */

import {FOCUSABLE_SELECTOR} from '../hooks/focusableSelector';
import {
  getInteractionModality,
  type InteractionModality,
} from './interactionModality';
import {isFocusDetached} from './isFocusDetached';

/**
 * True when focus would be lost if `surface` hid now: nothing is focused (see
 * isFocusDetached) or focus sits inside `surface`. Reads `surface`'s own
 * document, so a surface in an iframe or Picture-in-Picture window is
 * answered there. Internal: not exported from the utils barrel.
 */
export function isFocusLost(surface: Element | null, doc?: Document): boolean {
  const ownerDocument = doc ?? surface?.ownerDocument ?? document;
  return (
    isFocusDetached(ownerDocument) ||
    (surface != null && surface.contains(ownerDocument.activeElement))
  );
}

/** Where focus was, inside a container, before a change removed or hid content. */
export interface FocusWithin {
  readonly element: Element;
  readonly container: HTMLElement;
}

/**
 * The focused element, if it is inside `container`. A disclosure calls this
 * in the commit before the DOM changes (`LayoutChangeSnapshot`'s
 * `onBeforeChange`), and passes the result to `moveFocusLeftBehind` from a
 * layout effect of the same commit. Internal.
 */
export function noteFocusWithin(
  container: HTMLElement | null | undefined,
): FocusWithin | null {
  const active = container?.ownerDocument.activeElement;
  if (container == null || active == null || !container.contains(active)) {
    return null;
  }
  return {element: active, container};
}

/**
 * Moves focus noted by `noteFocusWithin` to `target` when the change lost it
 * (`isFocusLost`): it fell to the page because its element was removed, or
 * it is still inside `hidden`, content the change hid but kept, which the
 * browser is about to blur. Focus that survived the change, or that was never
 * inside, is not moved. The ring follows the last input, so the calling
 * component keeps modality tracking active
 * (`useInteractionModalityTracking()`). Returns whether focus moved. Internal.
 */
export function moveFocusLeftBehind(
  note: FocusWithin | null,
  target: HTMLElement | null | undefined,
  hidden: Element | null = null,
  options?: FocusOptions,
): boolean {
  if (
    note == null ||
    target == null ||
    !isFocusLost(hidden, note.container.ownerDocument)
  ) {
    return false;
  }
  focusForLastInputTemporarily(target, options);
  return target.ownerDocument.activeElement === target;
}

const temporaryFocus = new WeakMap<HTMLElement, () => void>();

/** Release only a temporary tab stop owned by this module. Internal. */
export function releaseTemporaryFocus(element: HTMLElement): void {
  temporaryFocus.get(element)?.();
}

/** Focuses the element. A nonfocusable element gets a tab stop until blur or disposal. Internal. */
export function focusForLastInputTemporarily(
  element: HTMLElement,
  options?: FocusOptions,
  modality: InteractionModality = getInteractionModality(element),
): () => void {
  releaseTemporaryFocus(element);
  const needsTabIndex =
    !element.hasAttribute('tabindex') &&
    element.tabIndex < 0 &&
    !element.isContentEditable &&
    !element.matches(FOCUSABLE_SELECTOR);
  if (!needsTabIndex) {
    focusForLastInput(element, options, modality);
    return () => {};
  }
  element.setAttribute('tabindex', '-1');
  const dispose = () => {
    if (temporaryFocus.get(element) !== dispose) {
      return;
    }
    temporaryFocus.delete(element);
    element.removeEventListener('blur', dispose);
    if (element.getAttribute('tabindex') === '-1') {
      element.removeAttribute('tabindex');
    }
  };
  temporaryFocus.set(element, dispose);
  focusForLastInput(element, options, modality);
  // Pointer-modality refocus can blur first; acquire cleanup after that move.
  if (element.ownerDocument.activeElement === element) {
    element.addEventListener('blur', dispose, {once: true});
  } else {
    dispose();
  }
  return dispose;
}

/**
 * Move focus programmatically so its ring follows the last input. After pointer input the browser's
 * focus option keeps the element from matching `:focus-visible`, which is the
 * one way to reach an element the overlay does not render: the consumer's
 * autofocus target, the control that opened a Dialog, or a menu trigger the
 * caller renders. Pass `options` (for example `preventScroll`) as to `focus()`.
 *
 * `modality` defaults to the last input in the element's own document: the
 * page's for an element on the page, and a second document's (a same-origin
 * iframe, a Document Picture-in-Picture window) for an element there, which
 * the component tracks by passing its element's ref to
 * `useInteractionModalityTracking`.
 *
 * Make sure modality tracking is active (`useInteractionModalityTracking()`)
 * in the component that calls this.
 */
export function focusForLastInput(
  element: HTMLElement,
  options?: FocusOptions,
  modality: InteractionModality = getInteractionModality(element),
): void {
  // A text-entry field paints its own focus treatment to show where typing
  // goes, and an extra blur there can run validation or mark it touched. The
  // field's own window: one in an iframe or a Picture-in-Picture window is
  // never an instance of the page's constructors.
  const view = element.ownerDocument.defaultView ?? window;
  const isTextEntry =
    element instanceof view.HTMLInputElement ||
    element instanceof view.HTMLTextAreaElement ||
    element instanceof view.HTMLSelectElement ||
    element.isContentEditable;
  if (isTextEntry || modality !== 'pointer') {
    if (options === undefined) {
      element.focus();
    } else {
      element.focus(options);
    }
    return;
  }
  // Focusing the element that already has focus does nothing, so a ring the
  // browser already drew would stay. WebKit draws one when its own focus
  // restoration (a dialog's close, a popover's hide) moves focus itself, so
  // clear that focus first.
  if (element.matches(':focus-visible')) {
    element.blur();
  }
  element.focus({...options, focusVisible: false});
}

/**
 * Returns focus to `opener` after an overlay closes, without a scroll and with
 * the ring the last input calls for. WebKit records the nearest focusable
 * ancestor of a tapped button as the opener, such as a `tabindex="-1"` main
 * region. A reveal of that region scrolls the page to its top edge.
 */
export function returnFocusForLastInput(
  opener: HTMLElement,
  modality?: InteractionModality,
): void {
  focusForLastInput(opener, {preventScroll: true}, modality);
}

/**
 * Prepares a focus repair for an open surface that may be removed while open
 * (rendered only while open, or removed with its view). Removing a `<dialog>`
 * runs no close and no browser focus return. Call this while the surface is
 * mounted: it reads the frame that hosts the surface now, because a removed
 * frame's document has no window. Call the returned function from the effect
 * cleanup with the repair to run.
 *
 * Once the commit has finished, the repair runs only when the surface really
 * left the document (StrictMode's simulated unmount keeps it) and the removal
 * lost focus, both in the surface's document and in the document that hosts
 * its frame. A control the user pressed outside the surface, or outside its
 * frame, keeps its focus, and so does a surface that took focus in the same
 * commit.
 */
export function prepareFocusRepairOnRemoval(
  surface: Element,
  options?: {
    /**
     * Skip the repair when focus already rested on the page body before the
     * commit's first removal: the removal did not lose that focus.
     */
    keepRestingFocus?: boolean;
  },
): (repair: () => void) => void {
  const host = surface.ownerDocument.defaultView?.frameElement ?? null;
  return repair => {
    if (
      options?.keepRestingFocus === true &&
      wasFocusDetachedBeforeRemoval(surface.ownerDocument)
    ) {
      return;
    }
    queueMicrotask(() => {
      if (surface.isConnected) {
        return;
      }
      if (isFocusLost(surface) && (host == null || isFocusLost(host))) {
        repair();
      }
    });
  };
}

// Whether focus rested on the page body when the current commit began
// removing surfaces, per document. One removal can drop focus before a later
// surface's cleanup runs, so every cleanup of the commit reads the first value.
const focusDetachedAtRemovalStart = new WeakMap<Document, boolean>();
function wasFocusDetachedBeforeRemoval(doc: Document): boolean {
  let wasDetached = focusDetachedAtRemovalStart.get(doc);
  if (wasDetached === undefined) {
    wasDetached = isFocusDetached(doc);
    focusDetachedAtRemovalStart.set(doc, wasDetached);
    queueMicrotask(() => focusDetachedAtRemovalStart.delete(doc));
  }
  return wasDetached;
}

/**
 * The focus repair above that returns focus to `opener` while the opener is
 * still on the page. Call the returned function from the effect cleanup with
 * the opener.
 */
export function prepareFocusReturnOnRemoval(
  surface: Element,
): (opener: Element | null) => void {
  const repairOnRemoval = prepareFocusRepairOnRemoval(surface);
  return opener => {
    repairOnRemoval(() => {
      if (opener != null && opener.isConnected) {
        returnFocusForLastInput(opener as HTMLElement);
      }
    });
  };
}
