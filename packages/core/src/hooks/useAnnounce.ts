// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useAnnounce.ts
 * @input React context; DOM live regions; animation frames
 * @output useAnnounce, AnnouncePoliteness, UseAnnounceOptions; the internal
 *   modal context, in-dialog region writer, and modal route hook
 * @position Core a11y hook for screen-reader announcements. A message goes to
 *   the nearest open native modal around its caller, else to the shared
 *   page-body regions. `modalAnnounce.ts` holds the modal route.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/hooks/index.ts
 */

import {createContext, use, useCallback, useRef, type RefObject} from 'react';

/**
 * Announcement urgency:
 * - `'polite'` (default): announced when the screen reader is idle. Use for
 *   status updates, result counts, "no results", non-urgent confirmations.
 * - `'assertive'`: interrupts the current announcement. Reserve for errors and
 *   time-sensitive alerts.
 */
export type AnnouncePoliteness = 'polite' | 'assertive';

/**
 * Imperative screen-reader announcement function.
 */
export type AnnounceFn = (
  message: string,
  politeness?: AnnouncePoliteness,
) => void;

/** Options for `useAnnounce`. */
export interface UseAnnounceOptions {
  /**
   * Each message from this instance withdraws the instance's previous message
   * if assistive technology has not exposed it yet, whatever its urgency. An
   * exposed message stays. Messages from other instances still join. Use one
   * instance for each state that a component reports, such as a result count.
   * @default false
   */
  hasReplace?: boolean;
}

/**
 * Takes back one announcer's share of a message while it is not yet exposed,
 * wherever the route put it. @internal
 */
export type WithdrawAnnouncement = () => void;

/**
 * One announcer's share of words on their way to being exposed. Whatever
 * holds the words keeps the receipt beside them; when the words move — a
 * modal hands them to the channel exposed after it, or releases words it
 * held through an exit — the mover points the receipt at the new place, so
 * the announcer's handle follows its words. @internal
 */
export interface AnnounceReceipt {
  withdraw: WithdrawAnnouncement | null;
}

/** Words waiting to be exposed, with their announcers' receipts. @internal */
export interface WaitingWords {
  readonly text: string;
  readonly receipts: ReadonlyArray<AnnounceReceipt>;
}

/**
 * The announcer's handle to `receipt`: it takes back the words wherever they
 * are now, once. @internal
 */
export function handleOf(receipt: AnnounceReceipt): WithdrawAnnouncement {
  return () => {
    const withdraw = receipt.withdraw;
    receipt.withdraw = null;
    withdraw?.();
  };
}

/**
 * Move `waiting` words elsewhere, one delivery per announcer and in order,
 * and point each receipt at its delivery, so every announcer can still take
 * back its own share. The deliveries join where they land, so the words are
 * spoken once. @internal
 */
export function forwardWaiting(
  waiting: ReadonlyArray<WaitingWords>,
  deliver: (text: string) => WithdrawAnnouncement | null,
): void {
  for (const {text, receipts} of waiting) {
    for (const receipt of receipts) {
      receipt.withdraw = deliver(text);
    }
  }
}

const CONTAINER_ATTR = 'data-astryx-live-region';

// The same clip as VisuallyHidden. It is inline, so the regions work without
// a stylesheet.
const VISUALLY_HIDDEN_CSS =
  'position:absolute;width:1px;height:1px;margin:-1px;padding:0;' +
  'overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;' +
  'inset-block-start:0;inset-inline-start:0;pointer-events:none;' +
  'user-select:none;';

interface LiveRegions {
  polite: HTMLElement;
  assertive: HTMLElement;
}

/**
 * Screen readers need this time to read the message. The clear then keeps
 * stale status text out of the accessibility tree.
 */
const CLEAR_DELAY_MS = 2000;

const clearTimers: {
  [K in AnnouncePoliteness]: ReturnType<typeof setTimeout> | null;
} = {
  polite: null,
  assertive: null,
};

function cancelScheduledClear(politeness: AnnouncePoliteness): void {
  const timer = clearTimers[politeness];
  if (timer != null) {
    clearTimeout(timer);
    clearTimers[politeness] = null;
  }
}

// Messages written before the region exposes them wait here. One frame
// exposes them together and in order, so none is dropped. An identical repeat
// is kept once.
const pendingFrames: Record<AnnouncePoliteness, number | null> = {
  polite: null,
  assertive: null,
};
// Each pending message counts its waiting announcers. When one withdraws it
// (a busy start overtaken by its outcome), the message stays for the others.
interface PendingMessage {
  text: string;
  holders: number;
}
const pendingMessages: Record<AnnouncePoliteness, PendingMessage[]> = {
  polite: [],
  assertive: [],
};
// The pending message the latest announce joined, until its announcer takes it.
let lastJoined: PendingMessage | null = null;

function cancelPendingFrames(politeness: AnnouncePoliteness): void {
  const frame = pendingFrames[politeness];
  if (frame != null) {
    cancelAnimationFrame(frame);
    pendingFrames[politeness] = null;
  }
  pendingMessages[politeness] = [];
}

function scheduleClear(
  politeness: AnnouncePoliteness,
  target: HTMLElement,
): void {
  cancelScheduledClear(politeness);
  clearTimers[politeness] = setTimeout(() => {
    clearTimers[politeness] = null;
    target.textContent = '';
  }, CLEAR_DELAY_MS);
}

// The live regions are created once and stay mounted. Many screen readers do
// not announce a live region that is created with its content. They do
// announce a text change in an empty region that is already mounted.
let regions: LiveRegions | null = null;

function createRegion(politeness: AnnouncePoliteness): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute(CONTAINER_ATTR, politeness);
  el.setAttribute('aria-live', politeness);
  el.setAttribute('aria-atomic', 'true');
  el.setAttribute('role', politeness === 'assertive' ? 'alert' : 'status');
  el.style.cssText = VISUALLY_HIDDEN_CSS;
  document.body.appendChild(el);
  return el;
}

function getRegions(): LiveRegions | null {
  if (typeof document === 'undefined') {
    return null;
  }
  if (regions) {
    // A test cleanup can remove a region from the DOM. Attach it again.
    if (!regions.polite.isConnected) {
      document.body.appendChild(regions.polite);
    }
    if (!regions.assertive.isConnected) {
      document.body.appendChild(regions.assertive);
    }
    return regions;
  }
  regions = {
    polite: createRegion('polite'),
    assertive: createRegion('assertive'),
  };
  return regions;
}

/**
 * Write `message` to the shared region for `politeness`, joining the messages
 * not yet exposed. Returns how to take this write back while it waits.
 */
export function announceMessage(
  message: string,
  politeness: AnnouncePoliteness,
): WithdrawAnnouncement | null {
  const r = getRegions();
  if (!r) {
    return null;
  }
  const target = politeness === 'assertive' ? r.assertive : r.polite;
  const repeat = pendingMessages[politeness].find(
    pending => pending.text === message,
  );
  if (repeat != null) {
    repeat.holders += 1;
    lastJoined = repeat;
    return () => withdrawPendingAnnouncement(repeat, politeness);
  }
  const pending = {text: message, holders: 1};
  pendingMessages[politeness].push(pending);
  lastJoined = pending;
  if (pendingFrames[politeness] == null) {
    // Clear first, so the change is seen when the new text equals the old
    // text. Some assistive technology ignores identical content.
    target.textContent = '';
    // Some assistive technology merges an immediate re-set with the clear. A
    // re-set in the next frame is more reliable.
    pendingFrames[politeness] = requestAnimationFrame(() => {
      pendingFrames[politeness] = null;
      target.textContent = pendingMessages[politeness]
        .map(pending => pending.text)
        .join(' ');
      pendingMessages[politeness] = [];
    });
  }
  // The clear keeps the last message out of the accessibility tree. Each
  // announce restarts the delay, which is much longer than the frame re-set.
  scheduleClear(politeness, target);
  return () => withdrawPendingAnnouncement(pending, politeness);
}

/**
 * Clear any pending announcement from a region without announcing anything new.
 * Used when the triggering context goes away (e.g. a search query is cleared),
 * so stale status text does not linger in the accessibility tree.
 */
export function clearRegion(politeness: AnnouncePoliteness): void {
  cancelPendingFrames(politeness);
  cancelScheduledClear(politeness);
  if (!regions) {
    return;
  }
  const target =
    politeness === 'assertive' ? regions.assertive : regions.polite;
  target.textContent = '';
}

/**
 * Returns an imperative `announce(message, politeness?)` function that speaks a
 * message through a persistently-mounted, visually-hidden live region.
 *
 * The polite and assertive regions are created once on first use and kept
 * mounted, so announcements are reliable even for messages that appear
 * immediately (unlike a live region rendered together with its content).
 * Messages announced in the same frame are joined, in order, into one
 * announcement, and an identical repeat is kept once. Each message is automatically cleared a couple of seconds after being
 * announced, so users browsing the DOM later do not encounter stale status
 * text; announcing again before the clear simply resets the countdown.
 *
 * An instance created with `hasReplace` states one current state, such as a
 * search's result count: each message it writes withdraws its previous one
 * while that one is not yet exposed, so typing faster than a frame says only
 * the latest count.
 *
 * @param options - `hasReplace` (default false)
 * @example
 * ```
 * function Search() {
 *   const announce = useAnnounce();
 *   const onResults = (n: number) => {
 *     announce(n === 0 ? 'No results found' : `${n} results`);
 *   };
 *   // ...
 * }
 * ```
 */
export function useAnnounce({
  hasReplace = false,
}: UseAnnounceOptions = {}): AnnounceFn {
  const modal = use(ModalAnnounceContext);
  // The latest write of a `hasReplace` instance. Its next message withdraws
  // it if assistive technology has not had it yet.
  const withdrawPreviousRef = useRef<WithdrawAnnouncement | null>(null);
  return useCallback(
    (message: string, politeness: AnnouncePoliteness = 'polite') => {
      if (hasReplace) {
        const withdrawPrevious = withdrawPreviousRef.current;
        withdrawPreviousRef.current = null;
        withdrawPrevious?.();
      }
      let written: WithdrawAnnouncement | null;
      // `modal` is non-null only below a provider, and a provider loads the
      // route. The route decides where the caller is heard.
      if (modal != null && modalRoute != null) {
        written = modalRoute.announce(modal, message, politeness);
      } else if (!message) {
        // An empty message clears the region, with the messages that are
        // not yet exposed.
        clearRegion(politeness);
        written = null;
      } else {
        written = announceMessage(message, politeness);
      }
      if (hasReplace) {
        withdrawPreviousRef.current = written;
      }
    },
    [hasReplace, modal],
  );
}

// Inside an Astryx modal (AST-086 FR14)
//
// The modal route lives in `modalAnnounce.ts`. ModalAnnounceProvider imports
// it, and it installs itself here when it loads. A component that calls
// `useAnnounce` but renders no modal never loads it. This module keeps what a
// caller without an Astryx modal needs: the region writer for a native modal
// that an app renders, and the DOM walk that finds that modal.

const MODAL_REGION_ATTR = 'data-astryx-modal-live-region';

/**
 * What an Astryx modal tells the hooks beneath it: where its dialog element
 * is, and the modal above it, so a caller inside a non-modal sheet nested in
 * a modal still finds the modal.
 */
export interface ModalAnnounceScope {
  dialogRef: RefObject<HTMLDialogElement | null>;
  // The owner's intent: open or presented in this render. A dialog that is
  // meant to be open but is not open yet is being presented in this commit.
  isOpen: boolean;
  parent: ModalAnnounceScope | null;
}

export const ModalAnnounceContext = createContext<ModalAnnounceScope | null>(
  null,
);
ModalAnnounceContext.displayName = 'ModalAnnounceContext';

/** The modal route `modalAnnounce.ts` installs when a provider loads it. */
export interface ModalRoute {
  /**
   * `useAnnounce` from inside `scope`: route `message` by where it is, and
   * return how to take this write back while it waits (a `hasReplace`
   * instance's next message does).
   */
  announce(
    scope: ModalAnnounceScope,
    message: string,
    politeness: AnnouncePoliteness,
  ): WithdrawAnnouncement | null;
  /**
   * Speak inside `dialog` with the exposure, covered and hold rules, and
   * return how to take this write back while it waits.
   */
  announceInModal(
    dialog: HTMLDialogElement,
    message: string,
    politeness: AnnouncePoliteness,
  ): WithdrawAnnouncement | null;
}

let modalRoute: ModalRoute | null = null;

/** Called once by `modalAnnounce.ts` as it loads. @internal */
export function installModalRoute(route: ModalRoute): void {
  modalRoute = route;
}

/** Whether `dialog` is open as a native modal right now. */
export function isOpenModal(
  dialog: HTMLDialogElement | null | undefined,
): boolean {
  return dialog != null && dialog.open && dialog.matches(':modal');
}

/**
 * The nearest open native modal dialog enclosing `element` in the DOM, Astryx
 * or app-rendered. Internal: the busy-announcement hook routes by its owner's
 * element so a busy start inside a native modal an app renders without Astryx
 * is still heard inside it.
 */
export function enclosingModalDialog(
  element: Element | null | undefined,
): HTMLDialogElement | null {
  let dialog = element?.closest('dialog') ?? null;
  while (dialog != null) {
    if (isOpenModal(dialog)) {
      return dialog;
    }
    dialog = dialog.parentElement?.closest('dialog') ?? null;
  }
  return null;
}

/**
 * Speak `message` through the modal `dialog`'s own live region. With the
 * modal route loaded (an Astryx modal is in the tree) the route applies its
 * exposure, covered and hold rules; without it — a native modal an app
 * renders without Astryx, and no Astryx modal anywhere — the words are
 * written to the dialog while it is open as a modal, else to the shared
 * channel. Returns how to take the words back while they wait, wherever they
 * move, so a busy start overtaken by its own outcome is never heard ahead of
 * it inside a modal. Internal: used by the busy-announcement hook.
 */
export function announceInModal(
  dialog: HTMLDialogElement,
  message: string,
  politeness: AnnouncePoliteness = 'polite',
): WithdrawAnnouncement | null {
  if (modalRoute != null) {
    return modalRoute.announceInModal(dialog, message, politeness);
  }
  if (isOpenModal(dialog)) {
    return writeModalRegion(dialog, message, politeness);
  }
  return announceMessage(message, politeness);
}

/** What the route asks of the writer in the write frame. @internal */
export interface ModalWriteGuard {
  isExposed: () => boolean;
  /** Deliver the waiting words elsewhere, forwarding their receipts. */
  redirect: (waiting: ReadonlyArray<WaitingWords>) => void;
}

// The pending state of each in-dialog region: the messages written since its
// text was last exposed, the frame that exposes them, the next frame, and the
// clear timer. Assistive technology does not take text in the frame that sets
// it. So a message that arrives before the next frame joins the words.
interface ModalPending {
  messages: string[];
  // One receipt for each announcer of a message. When one announcer withdraws
  // its share, the message stays for the others. The map is new after each
  // exposure, so a receipt never reaches equal words written later.
  receipts: Map<string, AnnounceReceipt[]>;
  frame: number | null;
  settleFrame: number | null;
  timer: ReturnType<typeof setTimeout> | null;
}

const pendingByRegion = new WeakMap<HTMLElement, ModalPending>();

function cancelPending(pending: ModalPending): void {
  if (pending.frame != null) {
    cancelAnimationFrame(pending.frame);
  }
  if (pending.settleFrame != null) {
    cancelAnimationFrame(pending.settleFrame);
  }
  if (pending.timer != null) {
    clearTimeout(pending.timer);
  }
}

/** Words written to `target` that assistive technology has not had yet. */
export function unexposedMessages(target: HTMLElement): string[] {
  return unexposedWords(target).map(words => words.text);
}

function waitingIn(pending: ModalPending): WaitingWords[] {
  return pending.messages.map(text => ({
    text,
    receipts: pending.receipts.get(text) ?? [],
  }));
}

/**
 * The words written to `target` that assistive technology has not had yet,
 * with their announcers' receipts, for a hand-off that forwards them.
 */
export function unexposedWords(target: HTMLElement): WaitingWords[] {
  const pending = pendingByRegion.get(target);
  if (pending == null) {
    return [];
  }
  return pending.frame != null || pending.settleFrame != null
    ? waitingIn(pending)
    : [];
}

export function modalRegion(
  dialog: HTMLDialogElement,
  politeness: AnnouncePoliteness,
): HTMLElement | null {
  return dialog.querySelector<HTMLElement>(
    `:scope > [${MODAL_REGION_ATTR}="${politeness}"]`,
  );
}

/**
 * The dialog's own live region for one urgency, created empty on first use
 * and kept as a direct child of the dialog so it survives the dialog's
 * content re-rendering.
 */
function ensureModalRegion(
  dialog: HTMLDialogElement,
  politeness: AnnouncePoliteness,
): HTMLElement {
  let region = modalRegion(dialog, politeness);
  if (region == null) {
    region = document.createElement('div');
    region.setAttribute(MODAL_REGION_ATTR, politeness);
    region.setAttribute(
      'role',
      politeness === 'assertive' ? 'alert' : 'status',
    );
    region.setAttribute('aria-live', politeness);
    region.setAttribute('aria-atomic', 'true');
    region.style.cssText = VISUALLY_HIDDEN_CSS;
    dialog.appendChild(region);
  }
  return region;
}

/**
 * Write `message` to the modal `dialog`'s own live region for `politeness`,
 * joining it to messages written there that are not yet exposed and saying
 * an identical repeat once. The region-writing core, shared by the full
 * modal route and by the busy-announcement hook's fallback for a native
 * modal an app renders without Astryx. `guard`, supplied by the route,
 * re-checks exposure in the write frame and redirects the waiting words when
 * the dialog stopped being exposed meanwhile. Returns this announcer's
 * handle: it takes back only its own share, only while the words wait, and
 * follows them when the route moves them.
 */
export function writeModalRegion(
  dialog: HTMLDialogElement,
  message: string,
  politeness: AnnouncePoliteness,
  guard?: ModalWriteGuard,
): WithdrawAnnouncement {
  const target = ensureModalRegion(dialog, politeness);
  const unexposed = unexposedMessages(target);
  const messages = unexposed.includes(message)
    ? unexposed
    : [...unexposed, message];
  const previous = pendingByRegion.get(target);
  const receipts =
    unexposed.length > 0 && previous != null
      ? previous.receipts
      : new Map<string, AnnounceReceipt[]>();
  const receipt: AnnounceReceipt = {withdraw: null};
  receipts.set(message, [...(receipts.get(message) ?? []), receipt]);
  if (previous != null) {
    cancelPending(previous);
  }
  // Clear first, so the change is seen when the new text equals the old
  // text. Some assistive technology ignores identical content.
  target.textContent = '';
  const pending: ModalPending = {
    messages,
    receipts,
    frame: null,
    settleFrame: null,
    timer: null,
  };
  pending.frame = requestAnimationFrame(() => {
    pending.frame = null;
    if (guard != null && !guard.isExposed()) {
      // The region stopped being exposed after the call. Send the words and
      // their receipts to where they will be heard.
      pendingByRegion.delete(target);
      guard.redirect(waitingIn(pending));
      return;
    }
    target.textContent = pending.messages.join(' ');
    pending.settleFrame = requestAnimationFrame(() => {
      pending.settleFrame = null;
    });
    pending.timer = setTimeout(() => {
      target.textContent = '';
      pendingByRegion.delete(target);
    }, CLEAR_DELAY_MS);
  });
  pendingByRegion.set(target, pending);
  receipt.withdraw = () => withdrawFromRegion(target, message, receipt);
  return handleOf(receipt);
}

/**
 * Withdraw one announcer's share of `message` from `target` while it is not
 * yet exposed. Then a busy start overtaken by its outcome is never heard, and
 * a `hasReplace` instance's next message replaces its previous one. The
 * message stays while another announcer holds it. A receipt that is not among
 * the waiting words takes back nothing.
 */
function withdrawFromRegion(
  target: HTMLElement,
  message: string,
  receipt: AnnounceReceipt,
): void {
  const pending = pendingByRegion.get(target);
  if (
    pending == null ||
    (pending.frame == null && pending.settleFrame == null)
  ) {
    return;
  }
  const receipts = pending.receipts.get(message);
  const at = receipts?.indexOf(receipt) ?? -1;
  if (receipts == null || at < 0) {
    return;
  }
  receipts.splice(at, 1);
  if (receipts.length > 0) {
    return;
  }
  pending.receipts.delete(message);
  pending.messages = pending.messages.filter(text => text !== message);
  if (pending.messages.length === 0) {
    cancelPending(pending);
    pendingByRegion.delete(target);
    target.textContent = '';
  } else if (pending.frame == null) {
    // Already written this frame, not yet taken: show the rest.
    target.textContent = pending.messages.join(' ');
  }
}

/**
 * Withdraw whatever the dialog's region for `politeness` holds or is about to
 * hold, as an empty message does on the shared channel. A dialog that never
 * announced has no region and nothing to clear.
 */
export function clearModalRegion(
  dialog: HTMLDialogElement,
  politeness: AnnouncePoliteness,
): void {
  const region = modalRegion(dialog, politeness);
  if (region == null) {
    return;
  }
  const pending = pendingByRegion.get(region);
  if (pending != null) {
    cancelPending(pending);
    pendingByRegion.delete(region);
  }
  region.textContent = '';
}

/**
 * Takes the pending message the latest announce joined, so that announcer can
 * withdraw its own share of it later. Shared with useBusyAnnouncement; not
 * exported from the hooks index.
 *
 * @internal
 */
export function takeJoinedAnnouncement(): object | null {
  const joined = lastJoined;
  lastJoined = null;
  return joined;
}

// A busy start overtaken by its own outcome is never spoken (AST-086 FR8).
/**
 * Withdraws one announcer's share of a message still waiting to be exposed, so
 * a busy start overtaken by its own outcome is never spoken.
 * The message stays while another announcer still holds it.
 *
 * @internal
 */
export function withdrawPendingAnnouncement(
  joined: object,
  politeness: AnnouncePoliteness,
): void {
  const pending = pendingMessages[politeness];
  const index = pending.indexOf(joined as PendingMessage);
  if (index < 0) {
    return;
  }
  pending[index].holders -= 1;
  if (pending[index].holders <= 0) {
    pending.splice(index, 1);
  }
}

/**
 * Test-only helper: removes the singleton live regions and resets state so
 * each test starts clean. Not part of the public runtime API.
 *
 * @internal
 */
export function __resetLiveRegionsForTest(): void {
  cancelPendingFrames('polite');
  cancelPendingFrames('assertive');
  cancelScheduledClear('polite');
  cancelScheduledClear('assertive');
  lastJoined = null;
  if (regions) {
    regions.polite.remove();
    regions.assertive.remove();
    regions = null;
  }
}
