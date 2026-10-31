// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file focusReturn.ts
 * @input The document's current active element and the shared interaction
 *   modality.
 * @output Whether focus is currently "detached" — on nothing in particular —,
 *   a focus move whose ring follows the last input, and useFocusReturn, which
 *   returns focus to whatever opened a surface when the surface closes or
 *   unmounts.
 * @position Utility; used by overlay triggers (e.g. DateInput, DateTimeInput)
 *   that return focus to their control when the overlay closes, but only when
 *   the dismiss did not already move focus somewhere the user chose, and by
 *   overlays (Dialog, DropdownMenu, useFocusTrap's surfaces) that move focus
 *   programmatically. useFocusReturn is internal: no package entry exports it.
 */

import {useEffect, useLayoutEffect, useRef, type RefObject} from 'react';
import {
  getInteractionModality,
  type InteractionModality,
} from './interactionModality';

/**
 * True when focus rests on nothing in particular — no active element, or the
 * document body / root element.
 *
 * An overlay (popover, calendar, dropdown) that restores focus to its trigger
 * on close should do so ONLY when this is true. A native `popover="auto"`
 * light-dismiss fires its close synchronously with the pointer event that
 * moved focus, so by the time the close handler runs, focus has already
 * landed on whatever the user clicked — another field, a button, anywhere.
 * Restoring focus unconditionally would yank it back and fight that click.
 * The one case the browser leaves unresolved is Escape or a click on
 * non-focusable empty space, which drops focus to the body; that is exactly
 * when the trigger should reclaim it.
 */
export function isFocusDetached(doc: Document = document): boolean {
  const active = doc.activeElement;
  return (
    active == null || active === doc.body || active === doc.documentElement
  );
}

/**
 * Move focus programmatically so its ring follows the last input
 * (`architecture:interaction-modality` INV1). After pointer input the browser's
 * focus option keeps the element from matching `:focus-visible`, which is the
 * one way to reach an element the overlay does not render: the consumer's
 * autofocus target, the control that opened a Dialog, or a menu trigger the
 * caller renders. Pass `options` (for example `preventScroll`) as to `focus()`.
 *
 * `modality` defaults to the page's last input. A caller moving focus inside a
 * second document (a same-origin iframe, a Document Picture-in-Picture window)
 * passes that document's, which it tracks with `trackInteractionModalityIn`.
 *
 * Make sure modality tracking is active (`useInteractionModalityTracking()`)
 * in the component that calls this.
 */
export function focusForLastInput(
  element: HTMLElement,
  options?: FocusOptions,
  modality: InteractionModality = getInteractionModality(),
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

export interface FocusReturnOptions {
  /**
   * Return focus only if it entered the surface while it was open. A popup
   * that keeps focus on its own trigger (a listbox anchored to an input) never
   * takes focus, and returning it there would cancel a blur the user asked
   * for. Default `false`.
   */
  requireFocusInside?: boolean;
  /**
   * `'last-input'` (default) rings the opener as the last input calls for;
   * `'browser'` leaves the ring to the browser's plain `focus()`.
   */
  ring?: 'last-input' | 'browser';
}

/**
 * Return focus to the element that opened a surface when the surface closes,
 * or unmounts while open (`component:Dialog` FR4, `component:Popover` AR4).
 *
 * - **Records** the opener while the surface opens, in a layout effect so it
 *   lands before any descendant's mount effect can move focus inside. It reads
 *   the surface's own document when that document has focus: a surface an app
 *   renders into a same-origin iframe or a Document Picture-in-Picture window,
 *   opened from a control there, is opened from that document, which the
 *   page's document reports only as the iframe element, or not at all.
 * - **Returns** focus only when it would otherwise be lost: nothing focused,
 *   the body or root, still inside the surface, or already back on the opener
 *   (a native dialog's close restores it, and WebKit may draw a ring). A
 *   consumer that already moved focus somewhere else keeps it there.
 * - **Rings** the opener as the last input in the opener's own document calls
 *   for (`architecture:interaction-modality` INV1), through
 *   `focusForLastInput`.
 *
 * Call it after the effect that closes the surface (a native dialog's
 * `close()`), so the return runs once the surface has let focus go. Make sure
 * modality tracking is active in the calling component.
 */
export function useFocusReturn(
  surfaceRef: RefObject<HTMLElement | null>,
  isOpen: boolean,
  {requireFocusInside = false, ring = 'last-input'}: FocusReturnOptions = {},
): void {
  // What the open recorded: the opener, and whether focus entered the
  // surface. Cleared once focus is returned (or the return is skipped).
  const recordRef = useRef<FocusReturnRecord | null>(null);
  const optionsRef = useRef({requireFocusInside, ring});
  optionsRef.current = {requireFocusInside, ring};

  useLayoutEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    const surface = surfaceRef.current;
    const surfaceDocument = surface?.ownerDocument ?? document;
    const doc = surfaceDocument.hasFocus() ? surfaceDocument : document;
    const record: FocusReturnRecord = {
      opener: doc.activeElement as HTMLElement | null,
      hadFocusInside:
        surface != null && surface.contains(surfaceDocument.activeElement),
    };
    recordRef.current = record;
    const markFocusInside = (event: FocusEvent) => {
      const target = event.target as Node | null;
      if (target != null && surfaceRef.current?.contains(target)) {
        record.hadFocusInside = true;
      }
    };
    surfaceDocument.addEventListener('focusin', markFocusInside, true);
    return () => {
      surfaceDocument.removeEventListener('focusin', markFocusInside, true);
    };
  }, [isOpen, surfaceRef]);

  // Closing: by now the caller's close effect, declared before this one, has
  // let focus go.
  useEffect(() => {
    if (isOpen || recordRef.current == null) {
      return;
    }
    const record = recordRef.current;
    recordRef.current = null;
    returnFocus(record, surfaceRef.current, optionsRef.current);
  }, [isOpen, surfaceRef]);

  // Unmounting while open: no close runs, so return focus here. The surface is
  // already gone, so focus that was inside it reads as detached.
  useEffect(
    () => () => {
      const record = recordRef.current;
      recordRef.current = null;
      if (record != null) {
        returnFocus(record, null, optionsRef.current);
      }
    },
    [],
  );
}

interface FocusReturnRecord {
  opener: HTMLElement | null;
  hadFocusInside: boolean;
}

function returnFocus(
  {opener, hadFocusInside}: FocusReturnRecord,
  surface: HTMLElement | null,
  {requireFocusInside, ring}: Required<FocusReturnOptions>,
): void {
  if (opener == null || !opener.isConnected) {
    return;
  }
  if (requireFocusInside && !hadFocusInside) {
    return;
  }
  const openerDocument = opener.ownerDocument;
  if (opener === openerDocument.body) {
    return;
  }
  const active = openerDocument.activeElement;
  const surfaceActive = surface?.ownerDocument.activeElement ?? null;
  const focusWasLost =
    isFocusDetached(openerDocument) ||
    // Already back on the opener (a native dialog's close restores it): only
    // the ring needs correcting, which a plain focus() cannot do.
    (active === opener && ring === 'last-input') ||
    (surface != null &&
      (surface.contains(active) || surface.contains(surfaceActive)));
  if (!focusWasLost) {
    return;
  }
  if (ring === 'browser') {
    opener.focus();
  } else {
    focusForLastInput(
      opener,
      undefined,
      getInteractionModality(openerDocument),
    );
  }
}
