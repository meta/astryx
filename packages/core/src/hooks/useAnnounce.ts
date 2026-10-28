// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useAnnounce.ts
 * @input Uses React context and useCallback; DOM APIs and cancellable
 *   animation frames for a singleton live-region pair on the page body and
 *   one persistent polite/assertive pair inside each open Astryx modal
 * @output Exports useAnnounce hook and AnnouncePoliteness type; the internal
 *   modal context, the in-dialog region writer the busy-announcement hook
 *   uses, and the hook the modal route (`modalAnnounce.ts`, loaded only with
 *   an Astryx modal) installs itself through
 * @position Core a11y hook; provides imperative screen-reader announcements.
 *   A message follows the nearest open native modal enclosing its caller
 *   (`spec:AST-086` FR14): inside an Astryx modal it is written to that
 *   dialog's own containers, since the page-body channel is not exposed
 *   while a native modal is open; otherwise to the shared page-body pair.
 *   Containers are created empty (FR3), carry the two urgencies (FR5), join
 *   messages written before the previous is exposed and say an identical
 *   same-frame repeat once (FR9), and clear shortly after each announcement;
 *   the route in `modalAnnounce.ts` hands a message still unexposed when its
 *   modal stops being exposed to the channel exposed after it — the modal
 *   then on top, or the page body once no modal is open.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/hooks/index.ts
 */

import {createContext, use, useCallback, type RefObject} from 'react';

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

export function announceMessage(
  message: string,
  politeness: AnnouncePoliteness,
): void {
  const r = getRegions();
  if (!r) {
    return;
  }
  const target = politeness === 'assertive' ? r.assertive : r.polite;
  const repeat = pendingMessages[politeness].find(
    pending => pending.text === message,
  );
  if (repeat != null) {
    repeat.holders += 1;
    lastJoined = repeat;
    return;
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
export function useAnnounce(): AnnounceFn {
  const modal = use(ModalAnnounceContext);
  return useCallback(
    (message: string, politeness: AnnouncePoliteness = 'polite') => {
      // Inside an Astryx modal's provider: the modal route decides, per call,
      // where the caller is heard — `modal` is non-null only where a provider
      // rendered, and rendering one loads the route.
      if (modal != null && modalRoute != null) {
        modalRoute.announce(modal, message, politeness);
        return;
      }
      if (!message) {
        // An empty message clears any lingering status from the region,
        // including messages joined but not yet exposed — useful when the
        // triggering context ends.
        clearRegion(politeness);
        return;
      }
      announceMessage(message, politeness);
    },
    [modal],
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
  /** `useAnnounce` from inside `scope`: route `message` by where it is. */
  announce(
    scope: ModalAnnounceScope,
    message: string,
    politeness: AnnouncePoliteness,
  ): void;
  /** Speak inside `dialog` with the exposure, covered and hold rules. */
  announceInModal(
    dialog: HTMLDialogElement,
    message: string,
    politeness: AnnouncePoliteness,
  ): void;
  /** Withdraw an announcer's share, written or held. */
  withdrawFromModalPending(
    dialog: HTMLDialogElement,
    message: string,
    politeness: AnnouncePoliteness,
  ): void;
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
 * channel. Internal: used by the busy-announcement hook.
 */
export function announceInModal(
  dialog: HTMLDialogElement,
  message: string,
  politeness: AnnouncePoliteness = 'polite',
): void {
  if (modalRoute != null) {
    modalRoute.announceInModal(dialog, message, politeness);
    return;
  }
  if (isOpenModal(dialog)) {
    writeModalRegion(dialog, message, politeness);
  } else {
    announceMessage(message, politeness);
  }
}

/**
 * Withdraw one announcer's share of `message` from `dialog` before it is
 * exposed, written to its region or held by the route for the dialog's
 * close, so a busy start overtaken by its own outcome is never heard ahead
 * of it inside a modal (`spec:AST-086` FR8). Internal: used by the
 * busy-announcement hook's settle function.
 */
export function withdrawFromModalPending(
  dialog: HTMLDialogElement,
  message: string,
  politeness: AnnouncePoliteness = 'polite',
): void {
  if (modalRoute != null) {
    modalRoute.withdrawFromModalPending(dialog, message, politeness);
    return;
  }
  withdrawFromModalRegion(dialog, message, politeness);
}

/** What the route asks of the writer in the write frame. @internal */
export interface ModalWriteGuard {
  isExposed: () => boolean;
  redirect: (joinedMessage: string) => void;
}

// Each in-dialog region's pending state: the messages written since its text
// was last exposed, the frame that will expose them joined, the frame after
// that (text set in one frame is not yet taken by assistive technology in
// that same frame, so a message arriving before this frame runs still joins
// rather than wiping the words), and the timer that clears them afterwards.
interface ModalPending {
  messages: string[];
  // Announcers waiting on each message, by text: one withdrawing a message
  // (a busy start overtaken by its outcome) leaves it for the others.
  holders: Map<string, number>;
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
  const pending = pendingByRegion.get(target);
  if (pending == null) {
    return [];
  }
  return pending.frame != null || pending.settleFrame != null
    ? pending.messages
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
 * an identical repeat once; a holder count per text lets one announcer take
 * its share back (`withdrawFromModalPending`). The region-writing core,
 * shared by the full modal route and by the busy-announcement hook's fallback
 * for a native modal an app renders without Astryx. `guard`, supplied by the
 * route, re-checks exposure in the write frame and redirects the joined words
 * when the dialog stopped being exposed meanwhile.
 */
export function writeModalRegion(
  dialog: HTMLDialogElement,
  message: string,
  politeness: AnnouncePoliteness,
  guard?: ModalWriteGuard,
): void {
  const target = ensureModalRegion(dialog, politeness);
  const unexposed = unexposedMessages(target);
  const messages = unexposed.includes(message)
    ? unexposed
    : [...unexposed, message];
  const previous = pendingByRegion.get(target);
  const holders = new Map(
    unexposed.length > 0 && previous != null ? previous.holders : [],
  );
  holders.set(message, (holders.get(message) ?? 0) + 1);
  if (previous != null) {
    cancelPending(previous);
  }
  // Clearing first guarantees the mutation is observed even when the new
  // message equals the current text — some AT deduplicate identical content.
  target.textContent = '';
  const pending: ModalPending = {
    messages,
    holders,
    frame: null,
    settleFrame: null,
    timer: null,
  };
  pending.frame = requestAnimationFrame(() => {
    pending.frame = null;
    if (guard != null && !guard.isExposed()) {
      // Stopped being exposed between the call and this frame: the words go
      // where they will be heard.
      pendingByRegion.delete(target);
      guard.redirect(pending.messages.join(' '));
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
}

/**
 * Withdraw one announcer's share of `message` from `dialog`'s region before
 * it is exposed — written but not yet spoken — so a busy start overtaken by
 * its own outcome is never heard ahead of it (`spec:AST-086` FR8). The
 * message stays while another announcer holds it. The region half of
 * `withdrawFromModalPending`; the route also drops words it holds for the
 * dialog's close.
 */
export function withdrawFromModalRegion(
  dialog: HTMLDialogElement,
  message: string,
  politeness: AnnouncePoliteness = 'polite',
): void {
  const region = modalRegion(dialog, politeness);
  const pending = region == null ? undefined : pendingByRegion.get(region);
  if (
    region != null &&
    pending != null &&
    (pending.frame != null || pending.settleFrame != null)
  ) {
    const count = pending.holders.get(message) ?? 0;
    if (count > 1) {
      pending.holders.set(message, count - 1);
    } else if (count === 1) {
      pending.holders.delete(message);
      pending.messages = pending.messages.filter(text => text !== message);
      if (pending.messages.length === 0) {
        cancelPending(pending);
        pendingByRegion.delete(region);
        region.textContent = '';
      } else if (pending.frame == null) {
        // Already written this frame, not yet taken: show the rest.
        region.textContent = pending.messages.join(' ');
      }
    }
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
