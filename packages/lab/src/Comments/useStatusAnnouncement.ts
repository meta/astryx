// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useStatusAnnouncement.ts
 * @input Uses React, useAnnounce from core hooks
 * @output Exports useStatusAnnouncement hook
 * @position Internal to Comments; announces a transient status element
 *   (error banner, progress label) once instead of mounting it as a live region
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
 * @param ref The visible element, used to find an enclosing live container.
 * @param message The words to say, or `null` for nothing.
 * @param politeness Errors are `'assertive'`, progress is `'polite'` (FR5).
 */
export function useStatusAnnouncement(
  ref: RefObject<HTMLElement | null>,
  message: string | null,
  politeness: AnnouncePoliteness,
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
    const isInsideLiveContainer =
      ref.current?.parentElement?.closest(LIVE_CONTAINER_SELECTOR) != null;
    if (!isInsideLiveContainer) {
      announce(message, politeness);
    }
  }, [announce, message, politeness, ref]);
}
