// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useClipboard.ts
 * @input Uses React state/effect/callback; navigator.clipboard; useAnnounce
 * @output Exports useClipboard hook plus its options/return types
 * @position Core behavior hook; owns the copy-to-clipboard behavior shared by
 *   CodeBlock and Timestamp — the clipboard write, the transient "copied"
 *   flag with its reset timer, and the polite screen-reader announcement — so
 *   each call site is a thin control over one implementation instead of
 *   re-deriving the timer/announce details independently.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/hooks/index.ts
 * - /packages/core/src/hooks/useClipboard.doc.mjs
 * - /packages/core/src/hooks/useClipboard.test.tsx
 */

import {useCallback, useEffect, useRef, useState} from 'react';
import {useAnnounce} from './useAnnounce';

/**
 * How long `isCopied` stays true after a successful copy before reverting.
 * Long enough for the copied confirmation (e.g. a copy → check icon flip) to
 * register without lingering.
 */
const DEFAULT_RESET_AFTER_MS = 2000;

/**
 * Options for {@link useClipboard}.
 */
export interface UseClipboardOptions {
  /**
   * Message announced to a polite live region on a successful copy. Swapping a
   * control's `aria-label` alone is not reliably announced by screen readers,
   * so pass the localized confirmation (e.g. "Copied") to have it spoken.
   * Omit to skip the announcement.
   */
  announce?: string;
  /**
   * Milliseconds `isCopied` stays true after a successful copy before it
   * reverts to false.
   * @default 2000
   */
  resetAfterMs?: number;
}

/**
 * Return value of {@link useClipboard}.
 */
export interface UseClipboardReturn {
  /**
   * Write `text` to the clipboard. On success, flips `isCopied` to true,
   * announces the configured message, and (re)starts the reset timer;
   * resolves `true`. A clipboard rejection is a silent no-op that leaves the
   * copied state unchanged and resolves `false`.
   */
  copy: (text: string) => Promise<boolean>;
  /** True for `resetAfterMs` after the most recent successful copy. */
  isCopied: boolean;
}

/**
 * Copy-to-clipboard behavior: the clipboard write, a transient `isCopied`
 * flag with its own reset timer, and an optional polite screen-reader
 * announcement — the block otherwise re-derived at every copy affordance.
 *
 * Per [API Conventions → Behaviors: Hooks Over Wrappers], the behavior is a
 * hook and the control (an icon button, a menu item, a value chip) is a thin
 * shell over it. Rapid re-copies restart the reset timer so the confirmation
 * always lasts the full duration, and the timer is cleaned up on unmount.
 *
 * @example
 * ```
 * function CopyButton({text}: {text: string}) {
 *   const {copy, isCopied} = useClipboard({announce: 'Copied'});
 *   return (
 *     <IconButton
 *       label={isCopied ? 'Copied' : 'Copy'}
 *       tooltip="Copy"
 *       icon={<Icon icon={isCopied ? 'check' : 'copy'} />}
 *       onClick={() => void copy(text)}
 *     />
 *   );
 * }
 * ```
 */
export function useClipboard(
  options: UseClipboardOptions = {},
): UseClipboardReturn {
  const {copy, isCopied} = useClipboardCopy(options);
  return {copy, isCopied};
}

/**
 * Options of {@link useClipboardCopy}: the public options plus what a
 * component needs to report a failed write.
 */
export interface UseClipboardCopyOptions extends UseClipboardOptions {
  /** Message announced to the assertive live region when a write fails. */
  announceFailure?: string;
  /**
   * Called once with the rejection when a write fails. `copy` still resolves
   * `false`, and `isCopied` is unchanged.
   */
  onError?: (error: unknown) => void;
}

/** Return value of {@link useClipboardCopy}. */
export interface UseClipboardCopyReturn extends UseClipboardReturn {
  /**
   * True for `resetAfterMs` after the most recent write failed, until a write
   * succeeds.
   */
  isFailed: boolean;
}

/**
 * The body of {@link useClipboard}, plus the failed-write state a copy control
 * shows (CodeBlock's cross and its `onCopyError`). Not exported from the
 * package: the public hook's options and return type stay as they are.
 */
export function useClipboardCopy(
  options: UseClipboardCopyOptions = {},
): UseClipboardCopyReturn {
  const {
    announce: announceMessage,
    announceFailure,
    resetAfterMs = DEFAULT_RESET_AFTER_MS,
    onError,
  } = options;
  const announce = useAnnounce();
  const [isCopied, setIsCopied] = useState(false);
  const [isFailed, setIsFailed] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear pending resets when the consumer unmounts.
  useEffect(() => {
    return () => {
      if (resetTimerRef.current != null) {
        clearTimeout(resetTimerRef.current);
      }
      if (failedTimerRef.current != null) {
        clearTimeout(failedTimerRef.current);
      }
    };
  }, []);

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      try {
        await navigator.clipboard.writeText(text);
      } catch (error) {
        // A failure leaves the copied state unchanged; it shows for as long
        // as a copy would.
        setIsFailed(true);
        if (failedTimerRef.current != null) {
          clearTimeout(failedTimerRef.current);
        }
        failedTimerRef.current = setTimeout(() => {
          failedTimerRef.current = null;
          setIsFailed(false);
        }, resetAfterMs);
        if (announceFailure) {
          // A failure is an error, so screen readers hear it at once.
          announce(announceFailure, 'assertive');
        }
        onError?.(error);
        return false;
      }
      if (failedTimerRef.current != null) {
        clearTimeout(failedTimerRef.current);
        failedTimerRef.current = null;
      }
      setIsFailed(false);
      setIsCopied(true);
      if (announceMessage) {
        announce(announceMessage);
      }
      // Restart the reset timer on every copy — otherwise a rapid re-copy
      // is reverted early by the previous copy's timer.
      if (resetTimerRef.current != null) {
        clearTimeout(resetTimerRef.current);
      }
      resetTimerRef.current = setTimeout(() => {
        resetTimerRef.current = null;
        setIsCopied(false);
      }, resetAfterMs);
      return true;
    },
    [announce, announceMessage, announceFailure, resetAfterMs, onError],
  );

  return {copy, isCopied, isFailed};
}
