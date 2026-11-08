// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTruncation.ts
 * @input Uses React hooks, sharedResizeObserver, sharedMutationObserver
 * @output Exports useTruncation hook for detecting text overflow, and
 *   useHeldTruncation, internal to core: the same check with a hold, which
 *   its caller measures
 * @position Hook; consumed by Text.tsx, Heading.tsx
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Text/Text.doc.mjs
 */

import {useCallback, useRef, useState, type RefCallback} from 'react';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {isResizeObserved, observeResize} from '../utils/sharedResizeObserver';
import {observeContent} from '../utils/sharedMutationObserver';

export interface UseTruncationOptions {
  /**
   * Maximum number of lines before truncation.
   * 0 = no truncation, hook returns isTruncated: false
   */
  maxLines: number;
}

interface HeldTruncationOptions extends UseTruncationOptions {
  /**
   * While true, the hook keeps its last result and measures nothing. A caller
   * that shows the text unclamped for a while, such as an expanded caption,
   * keeps the clamped answer. Releasing it measures again.
   */
  isHeld: boolean;
}

export interface UseTruncationReturn {
  /**
   * Ref callback to attach to the text element
   */
  ref: RefCallback<HTMLElement>;

  /**
   * Whether the text is currently truncated (overflowing)
   */
  isTruncated: boolean;

  /**
   * Full text content for tooltip display
   */
  fullText: string;
}

/**
 * Hook for detecting text overflow/truncation.
 *
 * Uses a shared ResizeObserver singleton (via observeResize) for size
 * changes and a shared MutationObserver singleton (via observeContent) for
 * content changes, so even hundreds of table cells create one observer of
 * each kind. Observing content matters because an element whose text changes
 * without resizing (a fixed-width status line) must still be re-measured for
 * the tooltip text and the truncated state to follow the current content.
 *
 * - Single-line: compares scrollWidth > offsetWidth
 * - Multi-line: uses Range.getBoundingClientRect() to measure actual content
 *   height, bypassing -webkit-line-clamp's clamped scrollHeight
 *
 * @example
 * ```
 * const truncation = useTruncation({ maxLines: 2 });
 *
 * <div ref={truncation.ref} style={{ WebkitLineClamp: 2 }}>
 *   {text}
 * </div>
 *
 * {truncation.isTruncated && <Tooltip>{truncation.fullText}</Tooltip>}
 * ```
 */
export function useTruncation(
  options: UseTruncationOptions,
): UseTruncationReturn {
  const {ref, isTruncated, fullText} = useTruncationMeasure(
    options.maxLines,
    NEVER_HELD,
    true,
  );
  return {ref, isTruncated, fullText};
}

/**
 * useTruncation with a hold, internal to core. Lightbox holds its caption's
 * clamped answer while the caption is open. This variant observes nothing and
 * reads nothing by itself. Its caller observes the text and calls `measure`
 * after the browser lays the text out.
 */
export function useHeldTruncation(
  options: HeldTruncationOptions,
): UseTruncationReturn & {measure: () => void} {
  const {maxLines, isHeld} = options;
  const isHeldRef = useRef(isHeld);
  const truncation = useTruncationMeasure(maxLines, isHeldRef, false);
  // Syncs the hold with the caller's flag. The held answer stands until the
  // caller's next measurement after the release, so it never flickers.
  useIsomorphicLayoutEffect(() => {
    isHeldRef.current = isHeld;
  }, [isHeld]);
  return truncation;
}

/** A hold that never holds: plain useTruncation's. */
const NEVER_HELD: {readonly current: boolean} = {current: false};

/**
 * The measurement both hooks share. While `isHeldRef` holds, it measures
 * nothing. `measure` checks the current element again. Without `observes`, it
 * leaves observing and measuring the element to its caller.
 */
function useTruncationMeasure(
  maxLines: number,
  isHeldRef: {readonly current: boolean},
  observes: boolean,
): UseTruncationReturn & {measure: () => void} {
  const [isTruncated, setIsTruncated] = useState(false);
  const [fullText, setFullText] = useState('');
  const elementRef = useRef<HTMLElement | null>(null);
  const unobserveRef = useRef<(() => void) | null>(null);
  const unobserveContentRef = useRef<(() => void) | null>(null);

  const checkTruncation = useCallback(
    (element: HTMLElement) => {
      if (isHeldRef.current) {
        return;
      }
      if (maxLines === 0) {
        setIsTruncated(false);
        return;
      }

      // Capture full text content
      setFullText(element.textContent ?? '');

      // Check for overflow
      if (maxLines === 1) {
        // Single-line: check horizontal overflow
        setIsTruncated(element.scrollWidth > element.offsetWidth);
      } else {
        // Multi-line: use Range to measure actual content height.
        // When -webkit-line-clamp is active, browsers may report
        // scrollHeight === offsetHeight (the clamped size), so the
        // naive scrollHeight check fails. Range.getBoundingClientRect()
        // measures the real text content regardless of clamping.
        let contentHeight = element.scrollHeight;
        try {
          const range = document.createRange();
          range.selectNodeContents(element);
          contentHeight = range.getBoundingClientRect().height;
          range.detach();
        } catch {
          // Fallback to scrollHeight (e.g. jsdom in tests)
        }
        setIsTruncated(contentHeight > element.offsetHeight);
      }
    },
    [maxLines, isHeldRef],
  );

  const ref: RefCallback<HTMLElement> = useCallback(
    (element: HTMLElement | null) => {
      // Cleanup previous observation. Unsubscribing by callback rather than
      // by element leaves any other observer of the same node untouched.
      unobserveRef.current?.();
      unobserveRef.current = null;
      unobserveContentRef.current?.();
      unobserveContentRef.current = null;

      elementRef.current = element;
      if (!observes) {
        // A replaced text shows no truncation until its caller measures the
        // next one. So a stale answer never sizes the next text.
        if (element == null) {
          setIsTruncated(false);
          setFullText('');
        }
        return;
      }

      if (element && maxLines > 0) {
        // Observe via the shared singleton, if available. The call that
        // observeResize makes on registration runs inside React's commit, so
        // it measures nothing. The observer's first notification measures a
        // new element. The browser sends it after its own layout, so mounting
        // text forces no layout pass. An element another subscriber already
        // observes gets no new first notification, so a microtask after the
        // commit measures it. The truncated state only decides whether to
        // compose the tooltip, so nothing paints differently.
        if (typeof ResizeObserver !== 'undefined') {
          let registered = false;
          const wasObserved = isResizeObserved(element);
          const unobserve = observeResize(element, () => {
            if (registered) {
              checkTruncation(element);
            }
          });
          registered = true;
          unobserveRef.current = unobserve;
          // Skipped when this registration has ended by then (measuring
          // turned off, or the element replaced, in the same task).
          if (wasObserved) {
            queueMicrotask(() => {
              if (unobserveRef.current === unobserve) {
                checkTruncation(element);
              }
            });
          }
        } else {
          checkTruncation(element);
        }
        // New text in a box that keeps its size fires no resize, so the
        // captured text and truncated state would otherwise stay stale.
        unobserveContentRef.current = observeContent(element, () => {
          checkTruncation(element);
        });
      } else {
        setIsTruncated(false);
        setFullText('');
      }
    },
    [maxLines, checkTruncation, observes],
  );

  const measure = useCallback(() => {
    const element = elementRef.current;
    if (element != null && maxLines > 0) {
      checkTruncation(element);
    }
  }, [maxLines, checkTruncation]);

  return {
    ref,
    isTruncated,
    fullText,
    measure,
  };
}
