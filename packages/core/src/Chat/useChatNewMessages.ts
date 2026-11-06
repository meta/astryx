// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useChatNewMessages.ts
 * @input Uses React refs, state, ResizeObserver
 * @output Exports useChatNewMessages hook for detecting new chat messages
 * @position Utility hook — used by ChatLayout, also usable standalone
 *
 * Observes a content element via ResizeObserver and tracks the last
 * .astryx-chat-message element. When a new message appears (last element
 * changes), flags hasNewMessages if the scroll is unlocked.
 *
 * Also calls onResize on every content height change so the scroll
 * hook can follow growing content (streaming).
 *
 * Returns a callback ref — pass it as the contentRef in the layout
 * context. When the element mounts (even late), the observer attaches
 * automatically without needing state or version counters.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Chat/index.ts (exports)
 */

import {
  useCallback,
  useEffect,
  useInsertionEffect,
  useRef,
  useState,
} from 'react';
import {observeResize} from '../utils/sharedResizeObserver';

// =============================================================================
// Types
// =============================================================================

export interface UseChatNewMessagesOptions {
  /**
   * Whether the scroll is currently locked (following content).
   * When locked, new messages don't flag — the user is already at the bottom.
   */
  isLocked: boolean;

  /**
   * Called on every content height change (new message or streaming growth).
   * Use to trigger scroll-if-locked in the scroll hook.
   */
  onResize?: () => void;
}

export interface UseChatNewMessagesReturn {
  /** Whether new messages arrived while the scroll was unlocked. */
  hasNewMessages: boolean;

  /** Dismiss the new messages flag. */
  dismiss: () => void;

  /**
   * Callback ref to attach to the content element.
   * Handles late mount — observer attaches whenever the element appears.
   */
  contentRef: (el: HTMLElement | null) => void;
}

// =============================================================================
// Hook
// =============================================================================

export function useChatNewMessages({
  isLocked,
  onResize,
}: UseChatNewMessagesOptions): UseChatNewMessagesReturn {
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const lastMessageRef = useRef<Element | null>(null);
  const isLockedRef = useRef(isLocked);
  const onResizeRef = useRef(onResize);
  // The ref callback and the observer's first call run before layout Effects.
  useInsertionEffect(() => {
    isLockedRef.current = isLocked;
    onResizeRef.current = onResize;
  });

  // Track the current content element. When the callback ref fires,
  // we tear down the old observer and set up a new one.
  const elementRef = useRef<HTMLElement | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const attach = useCallback((el: HTMLElement) => {
    const unobserve = observeResize(el, () => {
      onResizeRef.current?.();

      const messages = el.getElementsByClassName('astryx-chat-message');
      const last = messages.length > 0 ? messages[messages.length - 1] : null;

      if (last && last !== lastMessageRef.current) {
        lastMessageRef.current = last;
        if (!isLockedRef.current) {
          setHasNewMessages(true);
        }
      }
    });

    cleanupRef.current = unobserve;
  }, []);

  const detach = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
  }, []);

  // Callback ref — handles mount, unmount, and element swap
  const contentRef = useCallback(
    (el: HTMLElement | null) => {
      if (el === elementRef.current) {
        return;
      }

      // Detach from previous element
      detach();
      elementRef.current = el;

      // Attach to new element
      if (el) {
        attach(el);
      }
    },
    [attach, detach],
  );

  // Releases the new-message tracking on unmount.
  useEffect(() => {
    return () => detach();
  }, [detach]);

  const dismiss = useCallback(() => {
    setHasNewMessages(false);
  }, []);

  return {hasNewMessages, dismiss, contentRef};
}
