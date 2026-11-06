// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTruncation.ts
 * @input Uses React hooks, sharedResizeObserver, sharedMutationObserver
 * @output Exports useTruncation hook for detecting text overflow, and
 *   useHeldTruncation, internal to core: the same check with a hold
 * @position Hook; consumed by Text.tsx, Heading.tsx
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Text/Text.doc.mjs
 */

import {useCallback, useRef, useState, type RefCallback} from 'react';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {observeResize} from '../utils/sharedResizeObserver';
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
  );
  return {ref, isTruncated, fullText};
}

/**
 * useTruncation with a hold, internal to core. Lightbox holds its caption's
 * clamped answer while the caption is open. `measure` checks the text again
 * at once, for a caller that knows when its text first lays out.
 */
export function useHeldTruncation(
  options: HeldTruncationOptions,
): UseTruncationReturn & {measure: () => void} {
  const {maxLines, isHeld} = options;
  const isHeldRef = useRef(isHeld);
  const truncation = useTruncationMeasure(maxLines, isHeldRef);
  const {measure} = truncation;
  // Syncs the hold with the caller's flag. A release measures the text again
  // after the commit. Until then the held answer stands, so it never flickers.
  useIsomorphicLayoutEffect(() => {
    const wasHeld = isHeldRef.current;
    isHeldRef.current = isHeld;
    if (wasHeld && !isHeld) {
      queueMicrotask(measure);
    }
  }, [isHeld, measure]);
  return truncation;
}

/** A hold that never holds: plain useTruncation's. */
const NEVER_HELD: {readonly current: boolean} = {current: false};

/**
 * The measurement both hooks share. While `isHeldRef` holds, it measures
 * nothing. `measure` checks the current element again.
 */
function useTruncationMeasure(
  maxLines: number,
  isHeldRef: {readonly current: boolean},
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

      if (element && maxLines > 0) {
        // Observe via shared singleton (if available). The first measurement
        // runs after the commit, in a microtask, instead of in the call
        // observeResize makes on registration: that call runs inside React's
        // commit, after other components' DOM writes, and forced a style and
        // layout pass per text on a page that mounts many. Every text
        // registered in one commit then reads layout once, together, and a
        // text whose element another subscriber already observes is measured
        // too. The truncated state only decides whether to compose the
        // tooltip, so nothing paints differently.
        if (typeof ResizeObserver !== 'undefined') {
          let registered = false;
          const unobserve = observeResize(element, () => {
            if (registered) {
              checkTruncation(element);
            }
          });
          registered = true;
          unobserveRef.current = unobserve;
          // Skipped when this registration has ended by then (measuring
          // turned off, or the element replaced, in the same task).
          queueMicrotask(() => {
            if (unobserveRef.current === unobserve) {
              checkTruncation(element);
            }
          });
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
    [maxLines, checkTruncation],
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
