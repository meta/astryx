// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useStatusAnnouncement.ts
 * @input Uses React, useAnnounce from core hooks
 * @output Exports useStatusAnnouncement hook
 * @position Internal to Lab; announces transient status messages and busy starts
 *   once instead of mounting them as live regions
 *
 * A live region that mounts already holding its text may not be announced, so
 * the visible element carries no live role (spec:AST-086 FR2). This hook says
 * the words once through the shared channel instead, unless a live container
 * such as a chat log already delivers content added inside it (FR4).
 */

import {useEffect, useRef, type RefObject} from 'react';
import {useAnnounce} from '@astryxdesign/core/hooks';
import type {AnnouncePoliteness} from '@astryxdesign/core/hooks';

const LIVE_CONTAINER_SELECTOR =
  '[role="log"], [role="status"], [role="alert"], [aria-live="polite"], [aria-live="assertive"]';

/**
 * Announce `message` once per occasion: when the element first shows it, and
 * again whenever the message changes. A rerender or a StrictMode effect replay
 * does not repeat it, and a message that goes away and comes back is a new
 * occasion (spec:AST-086 FR6).
 *
 * @param message The words to say, or `null` for nothing.
 * @param politeness Errors are `'assertive'`, progress is `'polite'` (FR5).
 * @param options.ref The visible element, when present, used to find an
 * enclosing live container.
 * @param options.skipPageLoad Keep messages present during page load silent
 * (FR11). Defaults to false to preserve Comments' error and progress delivery.
 */
export function useStatusAnnouncement(
  message: string | null,
  politeness: AnnouncePoliteness,
  {
    ref,
    skipPageLoad = false,
  }: {
    ref?: RefObject<HTMLElement | null>;
    skipPageLoad?: boolean;
  } = {},
): void {
  const announce = useAnnounce();
  const announcedRef = useRef<string | null>(null);
  useEffect(() => {
    if (message == null || message === '') {
      announcedRef.current = null;
      return;
    }
    if (announcedRef.current === message) {
      return;
    }
    announcedRef.current = message;
    // Remember a skipped message so completing page load is not a new occasion.
    if (skipPageLoad && document.readyState !== 'complete') {
      return;
    }
    const isInsideLiveContainer =
      ref?.current?.parentElement?.closest(LIVE_CONTAINER_SELECTOR) != null;
    if (!isInsideLiveContainer) {
      announce(message, politeness);
    }
  }, [announce, message, politeness, ref, skipPageLoad]);
}
