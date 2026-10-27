// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file modalAnnounce.ts
 * @input Uses the live-region internals of useAnnounce and DOM dialog state
 * @output Installs the modal route into useAnnounce as it loads, and exports
 *   the presentation bookkeeping ModalAnnounceProvider drives
 * @position Core a11y internal (spec:AST-086 FR14): where a message from
 *   inside an Astryx modal is heard. A dialog is exposed when it is open as
 *   a modal and neither inert nor aria-hidden; the top-layer order is kept
 *   by `open` alone; a message a dialog holds when it stops being exposed is
 *   handed to the channel exposed then, or held while an exiting modal still
 *   covers everything, and released at its real close; a covered modal is
 *   not written to; a caller inside a modal being presented in this commit
 *   waits one frame for the route. Loaded only by ModalAnnounceProvider, so
 *   a component that calls useAnnounce and renders no modal does not carry
 *   it.
 *
 * SYNC: not exported from /packages/core/src/hooks/index.ts.
 */

import {
  announceMessage,
  clearModalRegion,
  clearRegion,
  installModalRoute,
  isOpenModal,
  modalRegion,
  unexposedMessages,
  withdrawFromModalRegion,
  writeModalRegion,
  type AnnouncePoliteness,
  type ModalAnnounceScope,
} from './useAnnounce';

/**
 * Whether what is written inside `dialog` reaches assistive technology: open
 * as a modal, and not taken out of the accessibility tree by `inert` or
 * `aria-hidden` — a BottomSheet, standalone or a switcher step, stays open
 * through its exit motion in exactly that state.
 */
export function isExposed(dialog: HTMLDialogElement): boolean {
  return (
    isOpenModal(dialog) &&
    !dialog.inert &&
    dialog.getAttribute('aria-hidden') !== 'true'
  );
}

/**
 * The nearest open native modal dialog among the Astryx modals enclosing a
 * caller: a scrimless BottomSheet or Drawer is a dialog that is open but not
 * modal, so the walk continues to the modal above it.
 */
function enclosingOpenModal(
  scope: ModalAnnounceScope | null,
): HTMLDialogElement | null {
  for (let s = scope; s != null; s = s.parent) {
    const dialog = s.dialogRef.current;
    if (isOpenModal(dialog)) {
      return dialog;
    }
  }
  return null;
}

// The dialogs the providers have seen open, in the order they were last
// presented. `showModal()` sets `open` as it is called, so the order of the
// attribute records is the top-layer order, and the last one still open as a
// modal is the modal on top.
const presented: HTMLDialogElement[] = [];

export function notePresented(dialog: HTMLDialogElement): void {
  const at = presented.indexOf(dialog);
  if (at !== -1) {
    presented.splice(at, 1);
  }
  if (dialog.open) {
    presented.push(dialog);
  }
}

export function forgetPresented(dialog: HTMLDialogElement): void {
  const at = presented.indexOf(dialog);
  if (at !== -1) {
    presented.splice(at, 1);
  }
}

/**
 * The modal on top among the ones Astryx renders: the last presented that is
 * open, modal and exposed. One above it that is exiting (open, not exposed)
 * is on its way out and does not count — the step the person went back to
 * is on top while the step they left fades.
 */
function topExposedModal(): HTMLDialogElement | null {
  for (let i = presented.length - 1; i >= 0; i -= 1) {
    if (isExposed(presented[i])) {
      return presented[i];
    }
  }
  return null;
}

/**
 * The channel exposed to the person right now, other than `except`, read
 * down the top-layer order: the first dialog that is exposed is it; a dialog
 * still open as a modal but not exposed — one running its exit above the
 * rest — covers everything beneath it, so nothing is exposed yet
 * (`'covered'`); the page body (`null`) is exposed once no native modal is
 * open.
 */
function nextExposedChannel(
  except: HTMLDialogElement,
): HTMLDialogElement | 'covered' | null {
  for (let i = presented.length - 1; i >= 0; i -= 1) {
    const dialog = presented[i];
    if (dialog !== except && isExposed(dialog)) {
      return dialog;
    }
    // `except` itself, still an open modal through its exit, covers what is
    // beneath it as any other exiting modal does.
    if (isOpenModal(dialog)) {
      return 'covered';
    }
  }
  // A modal presented in this same task is not in the list yet (its
  // attribute record is delivered after the task): the document still knows
  // it. With no presentation order to go by, the last such dialog in the
  // document stands for the one on top.
  let fallback: HTMLDialogElement | null = null;
  for (const dialog of document.querySelectorAll('dialog')) {
    if (dialog !== except && !presented.includes(dialog) && isExposed(dialog)) {
      fallback = dialog;
    }
  }
  return fallback;
}

/** Whether any native modal dialog is open in the document right now. */
function isAnyModalOpen(): boolean {
  for (const dialog of document.querySelectorAll('dialog')) {
    if (isOpenModal(dialog)) {
      return true;
    }
  }
  return false;
}

// Words waiting for an exiting modal's real close: their dialog has left
// the accessibility tree for its exit but is still an open native modal, or
// such a dialog covers the channel they would go to, so nothing is exposed
// yet. They are delivered when a dialog closes (or theirs is exposed again).
const held = new Map<HTMLDialogElement, Record<AnnouncePoliteness, string[]>>();

function hold(
  dialog: HTMLDialogElement,
  message: string,
  politeness: AnnouncePoliteness,
): void {
  let slot = held.get(dialog);
  if (slot == null) {
    slot = {polite: [], assertive: []};
    held.set(dialog, slot);
  }
  if (!slot[politeness].includes(message)) {
    slot[politeness].push(message);
  }
}

/** Drop what `dialog` holds for `politeness`: the owner took it back. */
function dropHeld(
  dialog: HTMLDialogElement,
  politeness: AnnouncePoliteness,
): void {
  const slot = held.get(dialog);
  if (slot == null) {
    return;
  }
  slot[politeness] = [];
  if (slot.polite.length === 0 && slot.assertive.length === 0) {
    held.delete(dialog);
  }
}

/** Deliver what `dialog` held, now that a channel may be exposed. */
function releaseHeld(dialog: HTMLDialogElement): void {
  const slot = held.get(dialog);
  if (slot == null) {
    return;
  }
  held.delete(dialog);
  for (const politeness of ['polite', 'assertive'] as const) {
    if (slot[politeness].length > 0) {
      const message = slot[politeness].join(' ');
      if (isExposed(dialog)) {
        announceInModalRouted(dialog, message, politeness);
      } else {
        // Holds again if still nothing is exposed.
        deliverBeyond(dialog, message, politeness);
      }
    }
  }
}

export function releaseAllHeld(): void {
  for (const dialog of [...held.keys()]) {
    releaseHeld(dialog);
  }
}

/**
 * Deliver `message` through the channel exposed now that `dialog` is not:
 * the modal on top, the page body once no modal is open, or — while the
 * dialog is still an open modal through its exit, with nothing exposed —
 * held until it closes.
 */
function deliverBeyond(
  dialog: HTMLDialogElement,
  message: string,
  politeness: AnnouncePoliteness,
): void {
  const next = nextExposedChannel(dialog);
  if (next === 'covered' || (next == null && isAnyModalOpen())) {
    // An exiting modal — this one, or one above the next candidate — is
    // still open and covers what is beneath it: nothing is exposed until
    // it closes.
    hold(dialog, message, politeness);
    return;
  }
  if (next != null) {
    announceInModalRouted(next, message, politeness);
    return;
  }
  announceMessage(message, politeness);
}

/**
 * Move whatever `dialog`'s containers hold that assistive technology has not
 * had yet to the channel exposed now. Called when the dialog stops being
 * exposed — closed, taken inert or `aria-hidden` for its exit, or unmounted
 * while open — so a message sent just before is not lost (FR14).
 */
export function handOffUnexposed(dialog: HTMLDialogElement): void {
  for (const politeness of ['polite', 'assertive'] as const) {
    const waiting = takeUnexposed(dialog, politeness);
    if (waiting.length > 0) {
      deliverBeyond(dialog, waiting.join(' '), politeness);
    }
  }
}

/**
 * An empty message from inside `dialog`: withdraw the words its region for
 * `politeness` holds or is about to hold, and the words of that urgency
 * waiting for the dialog's real close, so a status taken back while the
 * dialog exits ("3 results", then the query is cleared) is not delivered
 * after all once the dialog has closed.
 */
function withdrawFromModal(
  dialog: HTMLDialogElement,
  politeness: AnnouncePoliteness,
): void {
  clearModalRegion(dialog, politeness);
  dropHeld(dialog, politeness);
}

/** Take the unexposed messages out of a dialog's region, clearing it. */
function takeUnexposed(
  dialog: HTMLDialogElement,
  politeness: AnnouncePoliteness,
): string[] {
  const region = modalRegion(dialog, politeness);
  if (region == null) {
    return [];
  }
  const waiting = unexposedMessages(region);
  clearModalRegion(dialog, politeness);
  return waiting;
}

function announceInModalRouted(
  dialog: HTMLDialogElement,
  message: string,
  politeness: AnnouncePoliteness = 'polite',
): void {
  if (!isExposed(dialog)) {
    deliverBeyond(dialog, message, politeness);
    return;
  }
  const top = topExposedModal();
  if (top != null && top !== dialog && presented.includes(dialog)) {
    // Covered by a later Astryx modal: the owner is not operable until that
    // one closes, and a message announced meanwhile is not heard — the
    // container is clear before this modal is on top again.
    clearModalRegion(dialog, politeness);
    return;
  }
  writeModalRegion(dialog, message, politeness, {
    isExposed: () => isExposed(dialog),
    redirect: joined => deliverBeyond(dialog, joined, politeness),
  });
}

function withdrawFromModalPendingRouted(
  dialog: HTMLDialogElement,
  message: string,
  politeness: AnnouncePoliteness,
): void {
  withdrawFromModalRegion(dialog, message, politeness);
  const slot = held.get(dialog);
  if (slot != null) {
    slot[politeness] = slot[politeness].filter(text => text !== message);
    if (slot.polite.length === 0 && slot.assertive.length === 0) {
      held.delete(dialog);
    }
  }
}

// Messages from callers whose enclosing modal is being presented in this
// commit, waiting one frame for the route; an empty message among them
// withdraws the earlier ones of its urgency, as it would on a channel.
interface Deferred {
  frame: number;
  messages: Record<AnnouncePoliteness, string[]>;
  clears: Record<AnnouncePoliteness, boolean>;
}
const deferredByScope = new WeakMap<ModalAnnounceScope, Deferred>();

function deferUntilPresented(
  scope: ModalAnnounceScope,
  message: string,
  politeness: AnnouncePoliteness,
): void {
  let deferred = deferredByScope.get(scope);
  if (deferred == null) {
    const created: Deferred = {
      frame: requestAnimationFrame(() => {
        deferredByScope.delete(scope);
        const opened = enclosingOpenModal(scope);
        for (const urgency of ['polite', 'assertive'] as const) {
          if (created.clears[urgency]) {
            if (opened != null) {
              withdrawFromModal(opened, urgency);
            } else {
              clearRegion(urgency);
            }
          }
          for (const text of created.messages[urgency]) {
            if (opened != null) {
              announceInModalRouted(opened, text, urgency);
            } else {
              announceMessage(text, urgency);
            }
          }
        }
      }),
      messages: {polite: [], assertive: []},
      clears: {polite: false, assertive: false},
    };
    deferred = created;
    deferredByScope.set(scope, deferred);
  }
  if (!message) {
    deferred.messages[politeness] = [];
    deferred.clears[politeness] = true;
    return;
  }
  if (!deferred.messages[politeness].includes(message)) {
    deferred.messages[politeness].push(message);
  }
}

/**
 * Whether a provider nearer than the first open modal in the chain is meant
 * to be open but its dialog is not open yet: the caller sits inside a modal
 * being presented in this commit, which will be the one on top.
 */
function isBeingPresented(scope: ModalAnnounceScope | null): boolean {
  for (let s = scope; s != null; s = s.parent) {
    const dialog = s.dialogRef.current;
    if (isOpenModal(dialog)) {
      return false;
    }
    if (s.isOpen && (dialog == null || !dialog.open)) {
      return true;
    }
  }
  return false;
}

/**
 * `useAnnounce` from inside `scope`, resolved per call: the same owner is
 * sometimes inside a modal and sometimes not, and the modal it is in may have
 * just opened or closed.
 */
function announceFromScope(
  scope: ModalAnnounceScope,
  message: string,
  politeness: AnnouncePoliteness,
): void {
  if (isBeingPresented(scope)) {
    // Announced in the commit that opens the enclosing modal — a field error
    // inside `{isOpen && <Dialog isOpen>}`, alone or inside an already-open
    // Dialog — before the Dialog's own Effect, which runs after its
    // content's, has called showModal(). Choose the route a frame later,
    // when it has, rather than the modal beneath, which the new one is about
    // to cover; an empty message in the same commit withdraws what waits
    // (FR9). A caller inside a modal that is meant to be closed (its content
    // stays mounted) is not waiting for anything: it takes the route of
    // where it is now, joined with the frame's other messages.
    deferUntilPresented(scope, message, politeness);
    return;
  }
  const dialog = enclosingOpenModal(scope);
  if (!message) {
    // An empty message clears any lingering status, including messages
    // joined but not yet exposed and words held for the dialog's close.
    if (dialog != null) {
      withdrawFromModal(dialog, politeness);
    } else {
      clearRegion(politeness);
    }
    return;
  }
  if (dialog != null) {
    announceInModalRouted(dialog, message, politeness);
    return;
  }
  announceMessage(message, politeness);
}

installModalRoute({
  announce: announceFromScope,
  announceInModal: announceInModalRouted,
  withdrawFromModalPending: withdrawFromModalPendingRouted,
});
