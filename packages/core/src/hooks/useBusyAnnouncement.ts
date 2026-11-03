// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useBusyAnnouncement.ts
 * @input Whether the owning control is busy, the words to announce, and a ref
 *   to an element inside the control
 * @output Announces each busy start once, through the shared polite channel
 *   or a persistent region inside the open modal dialog holding the control
 * @position Core a11y hook for controls that show a decorative busy Spinner.
 *   It is a shared detail of the busy controls, so it is not in hooks/index.ts.
 */

// The busy Spinner is decorative, so the control announces its busy state,
// once for each busy start (AST-086). A re-render or a StrictMode replay does
// not repeat it, and the settle re-arms it. An owner calls the returned function
// when it announces the outcome. A busy start that is not yet announced is
// then dropped, so it never follows its own outcome. While a native modal is
// open, the page-body channel is not exposed. So a control in a modal
// announces through that dialog's polite region, also in a modal that an app
// renders without Astryx.

import {useCallback, useEffect, useRef, type RefObject} from 'react';
import {
  announceInModal,
  enclosingModalDialog,
  takeJoinedAnnouncement,
  useAnnounce,
  withdrawPendingAnnouncement,
  type WithdrawAnnouncement,
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
  // Or how to take back its write inside a modal, wherever the modal moves
  // it, until it settles.
  const modalMessageRef = useRef<WithdrawAnnouncement | null>(null);
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
      // The nearest open native modal around the control's element, Astryx or
      // app-rendered. Else the shared `useAnnounce` route, which follows the
      // nearest Astryx modal around this hook's caller.
      const dialog = enclosingModalDialog(elementRef.current);
      if (dialog != null) {
        modalMessageRef.current = announceInModal(dialog, message);
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
      const withdraw = modalMessageRef.current;
      modalMessageRef.current = null;
      withdraw();
    }
  }, []);
}
