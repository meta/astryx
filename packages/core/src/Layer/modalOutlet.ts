// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file modalOutlet.ts
 * @input The open Dialog and scrim BottomSheet `<dialog>` elements
 * @output Exports useModalOutlet (a modal supplies its outlet),
 *   getActiveModalOutlet, subscribeModalOutlets (a global host follows the
 *   latest one), and notifyTopLayerEntry (a non-modal surface entered the
 *   top layer above the hosts)
 * @position Private layer infrastructure; spec:AST-003 FR18
 *
 * A native modal makes everything outside it inert and paints over every
 * earlier top-layer element. A passive global host (ToastViewport) therefore
 * has to live in the DOM of the latest open modal to stay visible and
 * operable. The registry is module-level because the top layer is
 * document-wide: a host rendered in a separate React root (the useToast
 * fallback) must see modals rendered by the app. Listeners run synchronously,
 * so a host can leave a modal before React removes it from the document.
 *
 * A non-modal top-layer surface (a `popover="manual"` host shown by
 * `showPopover()`, such as a `hasScrim={false}` BottomSheet) blocks nothing,
 * so it is not an outlet, but it still enters the top layer above the hosts
 * shown before it. It announces the entry here, and a host re-enters the top
 * layer in place so it paints above the surface again.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Toast/ToastViewport.modalHost.test.tsx
 * - /docs/architecture/layer-runtime.md
 */

import {useEffect, useLayoutEffect, useRef, type RefObject} from 'react';

const outlets: HTMLDialogElement[] = [];
// Outlets whose order among themselves is decided by their caller (a stack of
// bottom sheets), keyed by that caller's group. Reordering stays inside the
// group: such an outlet never moves above an outlet of another group supplied
// later (a Dialog opened from a sheet).
const outletGroups = new WeakMap<HTMLDialogElement, string>();

/**
 * Why a host is told to place itself: `outlet` when the latest open modal
 * may have changed (the host moves into it or back out), `entry` when a
 * non-modal surface entered the top layer above the host (the host stays
 * where it is and re-enters the top layer).
 */
export type ModalOutletChange = 'outlet' | 'entry';

const listeners = new Set<(change: ModalOutletChange) => void>();

function notify(change: ModalOutletChange): void {
  for (const listener of listeners) {
    listener(change);
  }
}

/**
 * Supply an outlet. The latest goes on top. One re-supplied beneath its
 * group's top — a covered switcher flow whose level became a new dialog on a
 * step change made from code, while a sheet stays on top of it — goes
 * directly beneath that top, so the sheet on top stays the latest outlet and
 * a toast raised from it still lands there, not in the covered, inert step.
 */
function addOutlet(element: HTMLDialogElement, beneathGroupTop: boolean): void {
  const index = outlets.indexOf(element);
  if (index !== -1) {
    outlets.splice(index, 1);
  }
  const group = outletGroups.get(element);
  if (beneathGroupTop && group != null) {
    for (let other = outlets.length - 1; other >= 0; other -= 1) {
      if (outletGroups.get(outlets[other]) === group) {
        outlets.splice(other, 0, element);
        notify('outlet');
        return;
      }
    }
  }
  outlets.push(element);
  notify('outlet');
}

function removeOutlet(element: HTMLDialogElement): void {
  const index = outlets.indexOf(element);
  if (index === -1) {
    return;
  }
  outlets.splice(index, 1);
  outletGroups.delete(element);
  notify('outlet');
}

/**
 * Move `element` to the top of its own group: directly above the highest
 * outlet of the same group, and never above an outlet of another group that
 * was supplied later. A sheet revealed beneath an open Dialog stays beneath
 * the Dialog; a sheet re-shown by its stack stays beneath everything that is
 * not a sheet.
 */
function raiseWithinGroup(element: HTMLDialogElement): void {
  const group = outletGroups.get(element);
  const index = outlets.indexOf(element);
  if (group == null || index === -1) {
    return;
  }
  let target = outlets.length;
  for (let other = outlets.length - 1; other > index; other -= 1) {
    if (outletGroups.get(outlets[other]) !== group) {
      target = other;
    } else {
      break;
    }
  }
  // Nothing of another group sits above the group's top: go to the end.
  // Otherwise land just beneath the lowest foreign outlet above us.
  if (target - 1 === index) {
    return;
  }
  outlets.splice(index, 1);
  outlets.splice(target - 1, 0, element);
  notify('outlet');
}

/** The latest open native modal, or null when none is open. */
export function getActiveModalOutlet(): HTMLDialogElement | null {
  return outlets[outlets.length - 1] ?? null;
}

/**
 * Call `listener` whenever the latest open native modal may have changed
 * (`'outlet'`), or a non-modal surface entered the top layer (`'entry'`).
 */
export function subscribeModalOutlets(
  listener: (change: ModalOutletChange) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * A surface was just shown into the top layer above the global hosts: a
 * non-modal surface shown (`showPopover()` on a `popover="manual"` host), or
 * a modal dialog closed and shown again by a stack keeping its order, which
 * carries the host inside it back above the host's own popover. Global hosts
 * re-enter the top layer so they paint above it, as they do above a modal
 * that just opened.
 */
export function notifyTopLayerEntry(): void {
  notify('entry');
}

/**
 * Supply `ref`'s `<dialog>` as the passive global outlet while it is an open
 * modal. Call it after the effect that runs `showModal()`, so the modal is
 * already in the top layer when global hosts move into it.
 *
 * `isLatest`, `group`, and `hostKey` are for a caller whose modals are ordered among
 * themselves by something other than the order they were supplied in (a
 * stack of bottom sheets that is re-shown to keep open order, or reveals a
 * sheet by closing the one above it). By default the most recently supplied
 * outlet is the latest, which is the native top layer's order for modals
 * opened one after another. Such a caller names its `group` and passes the
 * ordering's own answer as `isLatest`: when it turns true the outlet is
 * raised to the top of its group — above the group's other outlets, never
 * above an outlet of another group supplied later, such as a Dialog opened
 * from the sheet — and when it turns false the outlet stays supplied (every
 * open modal supplies one) but is no longer the group's latest.
 */
export function useModalOutlet(
  ref: RefObject<HTMLDialogElement | null>,
  isActive: boolean,
  isLatest: boolean = true,
  group?: string,
  hostKey?: string | null,
): void {
  // `hostKey` names which element `ref` currently resolves to, for a caller
  // whose ref moves between dialogs while it stays active (a switcher flow
  // whose host dialog changes on a handoff): a change re-supplies the outlet
  // from the new element and withdraws the old one. A re-supply made while
  // the caller is not its group's latest (read through a ref, so a flip of
  // `isLatest` alone never re-supplies) goes beneath the group's top: the
  // sheet covering the flow keeps the outlet. A first supply always goes on
  // top; the stack's answer arrives a render later and the raise below
  // settles it.
  const isLatestRef = useRef(isLatest);
  isLatestRef.current = isLatest;
  const suppliedRef = useRef<HTMLDialogElement | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!isActive || element == null) {
      suppliedRef.current = null;
      return;
    }
    const isResupply = suppliedRef.current != null;
    suppliedRef.current = element;
    if (group != null) {
      outletGroups.set(element, group);
    }
    // A native close (a `method="dialog"` form) ends the modal without a
    // render. A `close` that arrives while the dialog is open again is stale:
    // the dialog was closed and re-shown in one task (a stack putting its
    // dialogs back in order, a sheet reopened during its exit), and the
    // event queued by that close must not take the outlet away from a modal
    // that is open.
    const handleClose = () => {
      if (element.open) {
        return;
      }
      removeOutlet(element);
    };
    element.addEventListener('close', handleClose);
    addOutlet(element, isResupply && !isLatestRef.current);
    return () => {
      element.removeEventListener('close', handleClose);
      removeOutlet(element);
    };
  }, [ref, isActive, group, hostKey]);

  // Becoming the latest of its group again (a sheet revealed by the close of
  // the one above it, or put back on top by its stack) raises the outlet
  // within that group only: an outlet of another group supplied later (a
  // Dialog opened from the sheet) stays above it, so a toast raised from
  // that Dialog keeps landing in the Dialog. The first supply above already
  // placed the outlet at the end.
  useEffect(() => {
    const element = ref.current;
    if (!isActive || !isLatest || element == null) {
      return;
    }
    raiseWithinGroup(element);
  }, [ref, isActive, isLatest, hostKey]);

  // Unmounting removes the dialog without a close event, and a passive
  // cleanup runs after React has detached it. A layout cleanup runs before,
  // so hosts leave while still in the document and keep their focus.
  useLayoutEffect(() => {
    const element = ref.current;
    return () => {
      if (element != null) {
        removeOutlet(element);
      }
    };
  }, [ref]);
}
