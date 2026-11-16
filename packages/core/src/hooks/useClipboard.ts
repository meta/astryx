// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useClipboard.ts
 * @input Uses React state/effect/callback; navigator.clipboard (else a
 *   selected hidden field and the copy command); useAnnounce
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
 * Whether this document may use the async Clipboard API to write. A frame
 * whose permissions policy does not allow `clipboard-write` (a sandboxed
 * viewer or an embed) refuses it, and the browser logs a policy violation for
 * each try. Without a policy API, the write is tried.
 */
function clipboardWriteAllowed(): boolean {
  const doc = document as Document & {
    permissionsPolicy?: {allowsFeature?: (feature: string) => boolean};
    featurePolicy?: {allowsFeature?: (feature: string) => boolean};
  };
  const policy = doc.permissionsPolicy ?? doc.featurePolicy;
  return typeof policy?.allowsFeature === 'function'
    ? policy.allowsFeature('clipboard-write')
    : true;
}

/**
 * Copy text through a selected, hidden text field and the browser's copy
 * command, which a click can still run where the async Clipboard API is
 * refused. Focus and the selection come back to where they were.
 * @throws when the browser does not copy
 */
function copyThroughSelection(text: string): void {
  const active = document.activeElement;
  const selection = document.getSelection();
  const ranges =
    selection == null
      ? []
      : Array.from({length: selection.rangeCount}, (_, i) =>
          selection.getRangeAt(i),
        );
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.setAttribute('aria-hidden', 'true');
  field.tabIndex = -1;
  // Off screen and inert: the field is there only to hold the selection.
  field.style.position = 'fixed';
  field.style.insetBlockStart = '0';
  field.style.insetInlineStart = '-9999px';
  field.style.opacity = '0';
  field.style.pointerEvents = 'none';
  document.body.append(field);
  let copied: boolean;
  try {
    // The copy command copies what is selected in the focused element.
    field.focus({preventScroll: true});
    field.select();
    copied = document.execCommand('copy');
  } finally {
    field.remove();
    if (active instanceof HTMLElement) {
      active.focus({preventScroll: true});
    }
    if (selection != null) {
      selection.removeAllRanges();
      for (const range of ranges) {
        selection.addRange(range);
      }
    }
  }
  if (!copied) {
    throw new Error('The browser did not copy the text.');
  }
}

/**
 * Write text to the clipboard: through the async Clipboard API where the
 * document may use it, else through a selection and the copy command.
 */
async function writeClipboardText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText != null && clipboardWriteAllowed()) {
    await navigator.clipboard.writeText(text);
    return;
  }
  copyThroughSelection(text);
}

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
   * resolves `true`. Where the document may not use the async Clipboard API
   * (a frame whose permissions policy does not allow `clipboard-write`), the
   * text is copied through a selection instead. A failed write is a silent
   * no-op that leaves the copied state unchanged and resolves `false`.
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
  const isMountedRef = useRef(true);

  // Syncs the reset timers with the consumer's mount: unmounting clears
  // them, and a write still in flight then sets no state.
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
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
        await writeClipboardText(text);
      } catch (error) {
        if (!isMountedRef.current) {
          onError?.(error);
          return false;
        }
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
      if (!isMountedRef.current) {
        return true;
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
