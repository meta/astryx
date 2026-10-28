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
 * exposed, so a control inside it announces through that dialog's polite
 * container, the one `useAnnounce` uses for every message from inside the
 * modal (FR14), inserted empty and filled a frame later (FR3); the control's
 * own element locates the modal, so a busy start inside a native modal an app
 * renders without Astryx is heard inside it too.
 *
 * SYNC: deliberately NOT exported from /packages/core/src/hooks/index.ts —
 * this is a shared implementation detail of Astryx's busy controls.
 */

import {useCallback, useEffect, useRef, type RefObject} from 'react';
import {
  announceInModal,
  enclosingModalDialog,
  takeJoinedAnnouncement,
  useAnnounce,
  withdrawFromModalPending,
  withdrawPendingAnnouncement,
} from './useAnnounce';

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
  // Or its write inside a modal's container, until it settles.
  const modalMessageRef = useRef<{
    dialog: HTMLDialogElement;
    message: string;
  } | null>(null);
  useEffect(() => {
    if (!isBusy) {
      hasAnnouncedRef.current = false;
      channelMessageRef.current = null;
      modalMessageRef.current = null;
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
      // The nearest open native modal around the control's own element,
      // Astryx or app-rendered, so a busy start inside a modal an app renders
      // without Astryx is still heard inside it (`spec:AST-086` FR14); the
      // shared `useAnnounce` route otherwise, which itself follows the
      // nearest Astryx modal around this hook's caller.
      const dialog = enclosingModalDialog(elementRef.current);
      if (dialog != null) {
        announceInModal(dialog, message);
        modalMessageRef.current = {dialog, message};
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
    // Written to the channel, or inside the modal, but not yet exposed:
    // withdraw it too.
    if (channelMessageRef.current != null) {
      withdrawPendingAnnouncement(channelMessageRef.current, 'polite');
      channelMessageRef.current = null;
    }
    if (modalMessageRef.current != null) {
      const {dialog, message} = modalMessageRef.current;
      withdrawFromModalPending(dialog, message, 'polite');
      modalMessageRef.current = null;
    }
  }, []);
}
