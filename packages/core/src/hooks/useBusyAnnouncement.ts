// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useBusyAnnouncement.ts
 * @input Whether the owning control is busy, the words to announce, and a ref
 *   to an element inside the control
 * @output Announces each busy start once, through the shared polite channel
 *   or a persistent region inside the open modal dialog holding the control
 * @position Core a11y hook for controls that show a decorative busy Spinner
 *
 * The busy Spinner inside a control is decorative (hidden, no live role); the
 * control announces its busy state instead (`spec:AST-086` FR8), once per busy
 * start (FR6): rerenders and StrictMode replay do not repeat it, and settling
 * re-arms it. The returned function is called by an owner announcing the
 * busy operation's outcome: a busy start not yet announced is dropped, so it
 * never follows its own outcome (FR8). While a native modal is open, the body-level channel is not
 * exposed, so a control inside it announces through one persistent polite
 * region in that dialog, inserted empty and filled a frame later (Platform
 * support, FR3).
 *
 * SYNC: deliberately NOT exported from /packages/core/src/hooks/index.ts —
 * this is a shared implementation detail of Astryx's busy controls.
 */

import {useCallback, useEffect, useRef, type RefObject} from 'react';
import {
  takeJoinedAnnouncement,
  useAnnounce,
  withdrawPendingAnnouncement,
} from './useAnnounce';

const REGION_ATTR = 'data-astryx-modal-busy-region';
const VISUALLY_HIDDEN_CSS =
  'position:absolute;width:1px;height:1px;margin:-1px;padding:0;' +
  'overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;';
const CLEAR_DELAY_MS = 2000; // Matches useAnnounce.

// The pending write and clear of each in-dialog region; a new write cancels
// them so an earlier message can neither land late nor clear a later one.
const pendingByRegion = new WeakMap<
  HTMLElement,
  {frame: number; timer?: ReturnType<typeof setTimeout>}
>();

function announceInModal(dialog: HTMLDialogElement, message: string): void {
  let region = dialog.querySelector<HTMLElement>(`:scope > [${REGION_ATTR}]`);
  if (region == null) {
    region = document.createElement('div');
    region.setAttribute(REGION_ATTR, '');
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('aria-atomic', 'true');
    region.style.cssText = VISUALLY_HIDDEN_CSS;
    dialog.appendChild(region);
  }
  const target = region;
  const previous = pendingByRegion.get(target);
  if (previous != null) {
    cancelAnimationFrame(previous.frame);
    clearTimeout(previous.timer);
  }
  target.textContent = '';
  const pending: {frame: number; timer?: ReturnType<typeof setTimeout>} = {
    frame: 0,
  };
  pending.frame = requestAnimationFrame(() => {
    target.textContent = message;
    pending.timer = setTimeout(() => {
      target.textContent = '';
      pendingByRegion.delete(target);
    }, CLEAR_DELAY_MS);
  });
  pendingByRegion.set(target, pending);
}

export function useBusyAnnouncement(
  isBusy: boolean,
  message: string,
  elementRef: RefObject<Element | null>,
): () => void {
  const announce = useAnnounce();
  const hasAnnouncedRef = useRef(false);
  const frameRef = useRef<number | null>(null);
  // This busy start's share of the shared channel's pending text, until it
  // settles.
  const channelMessageRef = useRef<object | null>(null);
  useEffect(() => {
    if (!isBusy) {
      hasAnnouncedRef.current = false;
      channelMessageRef.current = null;
      return;
    }
    if (hasAnnouncedRef.current) {
      return;
    }
    // Choose the route a frame later: a Dialog opening in the same commit
    // calls showModal() in its own Effect, which runs after this one.
    const frame = requestAnimationFrame(() => {
      frameRef.current = null;
      hasAnnouncedRef.current = true;
      const dialog = elementRef.current?.closest('dialog');
      if (dialog?.open && dialog.matches(':modal')) {
        announceInModal(dialog, message);
      } else {
        announce(message, 'polite');
        channelMessageRef.current = takeJoinedAnnouncement();
      }
    });
    frameRef.current = frame;
    return () => {
      cancelAnimationFrame(frame);
      frameRef.current = null;
    };
  }, [announce, elementRef, isBusy, message]);

  return useCallback(() => {
    if (frameRef.current != null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      // Still busy until the settled state commits; do not schedule again.
      hasAnnouncedRef.current = true;
    }
    // Written to the channel but not yet exposed: withdraw it too.
    if (channelMessageRef.current != null) {
      withdrawPendingAnnouncement(channelMessageRef.current, 'polite');
      channelMessageRef.current = null;
    }
  }, []);
}
