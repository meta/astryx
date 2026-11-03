// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useStreamingText.ts
 * @input React state, effects and refs; useMediaQuery; useTheme
 * @output useStreamingText hook for smooth text streaming
 * @position Core hook; smooths bursty streamed text into a steady reveal.
 *   Timing comes from the motion tokens, with defaults outside a theme.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/hooks/index.ts (exports)
 * - /packages/core/src/hooks/useStreamingText.test.ts (tests)
 */

import {useEffect, useMemo, useRef, useState} from 'react';
import {useMediaQuery} from './useMediaQuery';
import {useTheme} from '../theme/useTheme';

/**
 * Speed presets for streaming text reveal.
 * - `'natural'` — steady character-by-character reveal (~2 chars/frame)
 * - `'fast'` — faster reveal, scales with backlog (~4 chars/frame)
 * - `'instant'` — no animation, returns full text immediately
 */
export type StreamingTextSpeed = 'natural' | 'fast' | 'instant';

export interface UseStreamingTextOptions {
  /**
   * Speed of text reveal.
   * @default 'natural'
   */
  speed?: StreamingTextSpeed;
}

// Fallback values when no Theme provider is present
const FALLBACK_TICK_MS = 50;
const FALLBACK_TICK_MS_FAST = 8;

/**
 * Parse a CSS duration string (e.g. "175ms", "0.15s") to milliseconds.
 * Returns null if unparseable.
 */
function parseDuration(value: string): number | null {
  const ms = value.match(/^([\d.]+)ms$/);
  if (ms) {
    return parseFloat(ms[1]);
  }
  const s = value.match(/^([\d.]+)s$/);
  if (s) {
    return parseFloat(s[1]) * 1000;
  }
  return null;
}

const CHARS_PER_TICK = {
  natural: 10,
  fast: 4,
  instant: Infinity,
} as const;

// One shared segmenter. The granularity is fixed, and the locale does not
// change grapheme boundaries.
const graphemeSegmenter =
  typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, {granularity: 'grapheme'})
    : null;

function isLowSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xdc00 && codeUnit <= 0xdfff;
}

/**
 * Snap a UTF-16 code-unit offset down to the start of the grapheme cluster
 * it falls inside, so slicing `text` at the returned offset never splits a
 * surrogate pair, flag sequence, or ZWJ emoji mid-glyph. Offsets at the
 * start/end of the string are returned unchanged (nothing to snap).
 *
 * Falls back to snapping off a lone low surrogate when `Intl.Segmenter` is
 * unavailable — narrower than full grapheme-cluster awareness (a ZWJ
 * sequence or flag pair can still split in that path), but it's what's
 * achievable without a full grapheme-aware dependency, and it's strictly
 * better than the unguarded default of never checking at all.
 */
export function snapToGraphemeBoundary(text: string, offset: number): number {
  if (offset <= 0 || offset >= text.length) {
    return offset;
  }
  if (graphemeSegmenter) {
    // The guard above keeps offset in range, so `containing` is defined. The
    // `??` satisfies the wider type.
    return graphemeSegmenter.segment(text).containing(offset)?.index ?? offset;
  }
  return isLowSurrogate(text.charCodeAt(offset)) ? offset - 1 : offset;
}

/**
 * Smooths bursty streamed text into a steady character-by-character reveal.
 *
 * Returns a string that grows steadily toward `targetText`. When `isStreaming`
 * is false, returns the full `targetText` immediately. When the user prefers
 * reduced motion, the progressive reveal is skipped entirely and the full
 * `targetText` is returned immediately.
 *
 * The reveal cadence itself advances by a fixed number of UTF-16 code units
 * per tick, not on word or markdown-syntax boundaries — but the rendered
 * slice is always snapped back to the nearest grapheme cluster boundary, so
 * a tick landing mid-surrogate-pair or mid-emoji-sequence never renders a
 * broken glyph.
 *
 * @example
 * ```
 * const displayed = useStreamingText(rawText, isStreaming);
 * return <Markdown>{displayed}</Markdown>;
 * ```
 *
 * @example
 * ```
 * const displayed = useStreamingText(rawText, isStreaming, { speed: 'fast' });
 * ```
 */
export function useStreamingText(
  targetText: string,
  isStreaming: boolean,
  options?: UseStreamingTextOptions,
): string {
  const speed = options?.speed ?? 'natural';
  const charsPerTick = CHARS_PER_TICK[speed];

  // Tick timing comes from the motion tokens: natural uses
  // --duration-fast-min, and fast uses half of it, at least 4ms.
  const {token} = useTheme();
  const tickMs = useMemo(() => {
    if (speed === 'instant') {
      return 0;
    }
    const base = parseDuration(token('--duration-fast-min'));
    if (base == null) {
      return speed === 'fast' ? FALLBACK_TICK_MS_FAST : FALLBACK_TICK_MS;
    }
    // The per-frame tick is about 1/10 of the fast-min duration, so a 130ms
    // token gives a 13ms tick (natural) or a 6.5ms tick (fast).
    const tick = speed === 'fast' ? base / 20 : base / 10;
    return Math.max(4, Math.round(tick));
  }, [token, speed]);

  const [displayedLen, setDisplayedLen] = useState(0);
  const targetRef = useRef(targetText);
  const displayedLenRef = useRef(0);
  const lastTickRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  targetRef.current = targetText;

  // Reset when target clears (new message)
  const prevTargetLenRef = useRef(targetText.length);
  if (targetText.length !== prevTargetLenRef.current) {
    prevTargetLenRef.current = targetText.length;
    if (targetText.length === 0 && displayedLen !== 0) {
      displayedLenRef.current = 0;
      setDisplayedLen(0);
    }
  }

  const prevIsStreamingRef = useRef(isStreaming);
  if (isStreaming !== prevIsStreamingRef.current) {
    prevIsStreamingRef.current = isStreaming;
    if (!isStreaming && targetText.length > 0) {
      displayedLenRef.current = targetText.length;
      setDisplayedLen(targetText.length);
    }
  }

  // Reduced motion skips the progressive reveal and shows the full text.
  // useMediaQuery follows a preference change mid-stream.
  const prefersReducedMotion = useMediaQuery(
    '(prefers-reduced-motion: reduce)',
  );

  useEffect(() => {
    if (!isStreaming || speed === 'instant' || prefersReducedMotion) {
      return;
    }

    function tick(now: number) {
      const elapsed = now - lastTickRef.current;
      if (elapsed >= tickMs) {
        lastTickRef.current = now;
        const target = targetRef.current;
        const currentLen = displayedLenRef.current;

        if (currentLen < target.length) {
          const nextLen = Math.min(currentLen + charsPerTick, target.length);

          displayedLenRef.current = nextLen;
          setDisplayedLen(nextLen);
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isStreaming, charsPerTick, tickMs, speed, prefersReducedMotion]);

  if (!isStreaming || speed === 'instant' || prefersReducedMotion) {
    return targetText;
  }

  return targetText.slice(0, snapToGraphemeBoundary(targetText, displayedLen));
}
