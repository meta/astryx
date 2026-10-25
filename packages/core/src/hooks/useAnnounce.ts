// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useAnnounce.ts
 * @input Uses React useCallback; DOM APIs and one cancellable animation frame per region for a singleton live-region pair
 * @output Exports useAnnounce hook and AnnouncePoliteness type
 * @position Core a11y hook; provides imperative screen-reader announcements
 *   via persistently-mounted polite/assertive live regions; regions are
 *   auto-cleared shortly after announcing so stale status text does not
 *   linger in the accessibility tree
 *
 * SYNC: When modified, update:
 * - /packages/core/src/hooks/index.ts
 */

import {useCallback} from 'react';

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

function announceMessage(
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
function clearRegion(politeness: AnnouncePoliteness): void {
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
  return useCallback(
    (message: string, politeness: AnnouncePoliteness = 'polite') => {
      if (!message) {
        // An empty message clears any lingering status from the region,
        // including messages joined but not yet exposed — useful when the
        // triggering context ends.
        clearRegion(politeness);
        return;
      }
      announceMessage(message, politeness);
    },
    [],
  );
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
