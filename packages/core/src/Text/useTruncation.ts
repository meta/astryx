// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTruncation.ts
 * @input Uses React hooks, sharedResizeObserver, sharedMutationObserver
 * @output Exports useTruncation hook for detecting text overflow
 * @position Hook; consumed by Text.tsx, Heading.tsx and Lightbox.tsx
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Text/Text.doc.mjs
 */

import {useCallback, useRef, useState, type RefCallback} from 'react';
import {observeResizeAfterLayout} from '../utils/sharedResizeObserver';
import {observeContent} from '../utils/sharedMutationObserver';

export interface UseTruncationOptions {
  /**
   * Maximum number of lines before truncation.
   * 0 = no truncation, hook returns isTruncated: false
   */
  maxLines: number;

  /**
   * Pass true while the text is shown in full; the hook keeps reporting
   * whether it is cut off when clamped.
   */
  isExpanded?: boolean;
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
 * Whether an element's text overflows its line clamp. Single-line text
 * overflows horizontally. Multi-line text compares the content's real
 * height: with -webkit-line-clamp, browsers may report the clamped size as
 * scrollHeight, so Range.getBoundingClientRect() measures the content.
 */
function measureTruncation(element: HTMLElement, maxLines: number): boolean {
  if (maxLines === 1) {
    return element.scrollWidth > element.offsetWidth;
  }
  let contentHeight = element.scrollHeight;
  try {
    const range = document.createRange();
    range.selectNodeContents(element);
    contentHeight = range.getBoundingClientRect().height;
    range.detach();
  } catch {
    // Fallback to scrollHeight (e.g. jsdom in tests)
  }
  return contentHeight > element.offsetHeight;
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
  const {ref, isTruncated, fullText} = useTruncationMeasure(options);
  return {ref, isTruncated, fullText};
}

/** @internal */
export interface TruncationMeasureOptions extends UseTruncationOptions {
  /**
   * Measures at each hover, tap or focus (`measure`), not at mount, for
   * text that mounts many times at once, such as a Table's default cells.
   * After the first measurement, a content change measures again.
   */
  measuresOnInterest?: boolean;
}

/** @internal */
export interface TruncationMeasureReturn extends UseTruncationReturn {
  /** With `measuresOnInterest`: measures now and returns the answer. */
  measure: (() => boolean) | undefined;
}

/**
 * useTruncation with Core's internal modes. Text calls this; the public hook
 * calls it without them.
 * @internal
 */
export function useTruncationMeasure(
  options: TruncationMeasureOptions,
): TruncationMeasureReturn {
  const {maxLines, isExpanded = false, measuresOnInterest = false} = options;
  const [isTruncated, setIsTruncated] = useState(false);
  const [fullText, setFullText] = useState('');
  const elementRef = useRef<HTMLElement | null>(null);
  const unobserveRef = useRef<(() => void) | null>(null);
  const unobserveContentRef = useRef<(() => void) | null>(null);
  // The last measured answer, which the text keeps while it is expanded.
  const answerRef = useRef({isTruncated: false, fullText: ''});
  // The text an expanded element kept its answer for when it went.
  const keptForRef = useRef<HTMLElement | null>(null);

  const checkTruncation = useCallback(
    (element: HTMLElement) => {
      if (maxLines === 0) {
        setIsTruncated(false);
        return;
      }

      // Capture full text content
      answerRef.current.fullText = element.textContent ?? '';
      setFullText(answerRef.current.fullText);

      answerRef.current.isTruncated = measureTruncation(element, maxLines);
      setIsTruncated(answerRef.current.isTruncated);
    },
    [maxLines],
  );

  const ref: RefCallback<HTMLElement> = useCallback(
    (element: HTMLElement | null) => {
      // Cleanup previous observation. Unsubscribing by callback rather than
      // by element leaves any other observer of the same node untouched.
      unobserveRef.current?.();
      unobserveRef.current = null;
      unobserveContentRef.current?.();
      unobserveContentRef.current = null;

      const previous = elementRef.current;
      elementRef.current = element;

      // Shown in full, the text keeps the answer it had when clamped.
      if (isExpanded) {
        if (element != null) {
          setIsTruncated(answerRef.current.isTruncated);
          setFullText(answerRef.current.fullText);
        } else {
          keptForRef.current = previous;
        }
        return;
      }

      // A kept answer is about the text it measured. Other text starts from
      // none, as it does after its old element goes.
      const keptFor = keptForRef.current;
      keptForRef.current = null;
      if (keptFor != null && element !== keptFor) {
        answerRef.current = {isTruncated: false, fullText: ''};
        setIsTruncated(false);
        setFullText('');
      }

      // Text that measures on interest waits for its first hover, tap or
      // focus: it measures and observes nothing at mount.
      if (element && maxLines > 0 && measuresOnInterest) {
        return;
      }

      if (element && maxLines > 0) {
        // Observe via the shared singleton, if available. The observer's
        // first notification measures a new element. The browser sends it
        // after its own layout, so mounting text forces no layout pass. The
        // truncated state only decides whether to compose the tooltip, so
        // nothing paints differently.
        const unobserve = observeResizeAfterLayout(element, () => {
          checkTruncation(element);
        });
        if (unobserve == null) {
          checkTruncation(element);
        }
        unobserveRef.current = unobserve;
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
    [maxLines, isExpanded, measuresOnInterest, checkTruncation],
  );

  // Measures the attached text at a hover, tap or focus. The first call also
  // follows content changes from then on, so an open tooltip follows the text.
  const measureNow = useCallback((): boolean => {
    const element = elementRef.current;
    if (element == null || maxLines === 0) {
      return false;
    }
    checkTruncation(element);
    unobserveContentRef.current ??= observeContent(element, () => {
      checkTruncation(element);
    });
    return answerRef.current.isTruncated;
  }, [maxLines, checkTruncation]);

  return {
    ref,
    isTruncated,
    fullText,
    measure: measuresOnInterest ? measureNow : undefined,
  };
}
