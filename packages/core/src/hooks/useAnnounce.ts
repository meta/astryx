// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useAnnounce.ts
 * @input Uses React context and useCallback; DOM APIs and cancellable
 *   animation frames for a singleton live-region pair on the page body and
 *   one persistent polite/assertive pair inside each open Astryx modal
 * @output Exports useAnnounce hook (with its `hasReplace` option),
 *   AnnouncePoliteness and UseAnnounceOptions types; the internal modal
 *   context, the in-dialog region writer the busy-announcement hook uses, and
 *   the hook the modal route (`modalAnnounce.ts`, loaded only with an Astryx
 *   modal) installs itself through
 * @position Core a11y hook; provides imperative screen-reader announcements.
 *   A message follows the nearest open native modal enclosing its caller
 *   (`spec:AST-086` FR14): inside an Astryx modal it is written to that
 *   dialog's own containers, since the page-body channel is not exposed
 *   while a native modal is open; otherwise to the shared page-body pair.
 *   Containers are created empty (FR3), carry the two urgencies (FR5), join
 *   messages written before the previous is exposed and say an identical
 *   same-frame repeat once (FR9), except that a `hasReplace` instance's
 *   message withdraws that instance's previous one not yet exposed, and clear
 *   shortly after each announcement;
 *   the route in `modalAnnounce.ts` hands a message still unexposed when its
 *   modal stops being exposed to the channel exposed after it — the modal
 *   then on top, or the page body once no modal is open. Each write keeps a
 *   receipt per announcer beside the words, which follows them wherever
 *   they are moved, so the announcer can take back its own share.
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
   * The instance states one current state of its owner, such as a search's
   * result count: each message it writes withdraws the instance's previous
   * message while that one is not yet exposed, whatever their urgencies, and
   * is spoken in the region of its own urgency; a message already exposed has
   * been heard and stays. Messages from other instances, and from instances
   * without `hasReplace`, still join (`spec:AST-086` FR9). Give each state a
   * component reports its own instance.
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
 * back its own share (`spec:AST-086` FR9, FR14). The deliveries join where
 * they land, so the words are spoken once. @internal
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

// Visually-hidden clip block (matches the VisuallyHidden primitive). Applied
// inline so the regions work without any stylesheet being present.
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
 * How long an announcement stays in its region before being auto-cleared.
 * Long enough for screen readers to pick the message up and finish reading
 * it; clearing afterwards keeps stale status text out of the accessibility
 * tree for users who browse the DOM later. Each announce resets the timer.
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

// Messages announced before the region exposes them (written in the same
// frame) wait here and are exposed together, in order, so none is dropped;
// an identical repeat is the same message and is kept once (spec:AST-086
// FR9). One frame per region writes them.
const pendingFrames: Record<AnnouncePoliteness, number | null> = {
  polite: null,
  assertive: null,
};
// Each pending message counts the announcers waiting on it, so one of them
// withdrawing it (a busy start overtaken by its outcome) leaves it in place
// for the others.
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

// Singleton: the live regions are created ONCE and stay mounted for the
// lifetime of the document. This is the crux of reliable announcements — many
// screen readers will not announce content injected into a live region that is
// created together with its content ("born with content"). By mounting empty
// regions up front and only mutating their text later, updates are announced.
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
    // Re-attach if a region was removed from the DOM (e.g. by a test cleanup).
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
    // Clearing first guarantees the mutation is observed even when the new
    // message equals the current text — some AT deduplicate identical content.
    target.textContent = '';
    // A re-set in the next frame is more reliable across AT than an immediate
    // re-set, which can be coalesced with the clear.
    pendingFrames[politeness] = requestAnimationFrame(() => {
      pendingFrames[politeness] = null;
      target.textContent = pendingMessages[politeness]
        .map(pending => pending.text)
        .join(' ');
      pendingMessages[politeness] = [];
    });
  }
  // Auto-clear so the last message does not linger in the accessibility tree
  // indefinitely. Scheduled per announce, so a newer announcement always
  // resets the countdown (the delay comfortably outlasts the rAF re-set).
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
 * the latest count (`spec:AST-086` FR9).
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
  // A `hasReplace` instance's latest write, which its next message takes back
  // if assistive technology has not had it yet.
  const withdrawPreviousRef = useRef<WithdrawAnnouncement | null>(null);
  return useCallback(
    (message: string, politeness: AnnouncePoliteness = 'polite') => {
      if (hasReplace) {
        const withdrawPrevious = withdrawPreviousRef.current;
        withdrawPreviousRef.current = null;
        withdrawPrevious?.();
      }
      let written: WithdrawAnnouncement | null;
      // Inside an Astryx modal's provider: the modal route decides, per call,
      // where the caller is heard — `modal` is non-null only where a provider
      // rendered, and rendering one loads the route.
      if (modal != null && modalRoute != null) {
        written = modalRoute.announce(modal, message, politeness);
      } else if (!message) {
        // An empty message clears any lingering status from the region,
        // including messages joined but not yet exposed — useful when the
        // triggering context ends.
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

// =============================================================================
// Inside an Astryx modal (spec:AST-086 FR14)
// =============================================================================
//
// `useAnnounce` reads the nearest ModalAnnounceProvider's scope. The route a
// scope implies — exposure, the top-layer order, hand-off and hold on close,
// the covered rule, deferral while a modal is being presented — lives in
// `modalAnnounce.ts`, which ModalAnnounceProvider imports and which installs
// itself here when it loads. A context value is non-null only where a
// provider rendered, so the route is installed before it is needed, and a
// component that calls `useAnnounce` but renders no modal never loads it.
// What stays in this module is what a caller without any Astryx modal still
// needs: the region writer the busy-announcement hook uses inside a native
// modal an app renders without Astryx, and the DOM walk that finds it.

const MODAL_REGION_ATTR = 'data-astryx-modal-live-region';

/**
 * What an Astryx modal tells the hooks beneath it: where its dialog element
 * is, and the modal above it, so a caller inside a non-modal sheet nested in
 * a modal still finds the modal.
 */
export interface ModalAnnounceScope {
  dialogRef: RefObject<HTMLDialogElement | null>;
  // The owner's intent: open (or presented) in this render. A dialog meant
  // to be open that is not open yet is being presented in this commit.
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
 * is still heard inside it (`spec:AST-086` FR14, last sentence).
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
 * it inside a modal (`spec:AST-086` FR8). Internal: used by the
 * busy-announcement hook.
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

// Each in-dialog region's pending state: the messages written since its text
// was last exposed, the frame that will expose them joined, the frame after
// that (text set in one frame is not yet taken by assistive technology in
// that same frame, so a message arriving before this frame runs still joins
// rather than wiping the words), and the timer that clears them afterwards.
interface ModalPending {
  messages: string[];
  // The announcers waiting on each message, one receipt each: one taking its
  // share back (a busy start overtaken by its outcome, a `hasReplace`
  // instance's next message) leaves the message for the others. A fresh map
  // once the words are exposed, so a receipt never reaches equal words
  // written after its own were exposed.
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
  // Clearing first guarantees the mutation is observed even when the new
  // message equals the current text — some AT deduplicate identical content.
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
      // Stopped being exposed between the call and this frame: the words go
      // where they will be heard, their receipts with them.
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
 * yet exposed — written but not yet spoken — so a busy start overtaken by its
 * own outcome is never heard ahead of it (`spec:AST-086` FR8), and a
 * `hasReplace` instance's next message replaces its previous one (FR9,
 * FR14). The message stays while another announcer holds it; a receipt not
 * among the waiting words (they were exposed, cleared, or moved) takes back
 * nothing.
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

/**
 * Withdraws one announcer's share of a message still waiting to be exposed, so
 * a busy start overtaken by its own outcome is never spoken (spec:AST-086 FR8).
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
