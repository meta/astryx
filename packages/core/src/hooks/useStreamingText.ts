// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useStreamingText.ts
 * @input React state, effects and refs; useReducesMotion; useTheme
 * @output useStreamingText hook for smooth text streaming
 * @position Core hook; smooths bursty streamed text into a steady reveal.
 *   Timing comes from the motion tokens, with defaults outside a theme.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/hooks/index.ts (exports)
 * - /packages/core/src/hooks/useStreamingText.test.ts (tests)
 */

import {useEffect, useMemo, useRef, useState} from 'react';
import {useReducesMotion} from './useReducesMotion';
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

  // Where the reveal restarts: at 0 on a clear (a new message), at the whole
  // text on a stream's end. Adjusted during render, and only then, never per
  // chunk. State, not refs: a render React discards takes its adjustment with
  // it. The frame clock alone advances `revealed`, which counts only within
  // its restart's epoch.
  const [restart, setRestart] = useState({epoch: 0, len: 0});
  const [revealed, setRevealed] = useState({epoch: 0, len: 0});
  const displayedLen =
    revealed.epoch === restart.epoch ? revealed.len : restart.len;
  const targetRef = useRef(targetText);
  const lastTickRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  targetRef.current = targetText;

  if (targetText.length === 0 && displayedLen !== 0) {
    setRestart(previous => ({epoch: previous.epoch + 1, len: 0}));
  }
  const [wasStreaming, setWasStreaming] = useState(isStreaming);
  if (isStreaming !== wasStreaming) {
    setWasStreaming(isStreaming);
    if (!isStreaming && targetText.length > 0) {
      setRestart(previous => ({
        epoch: previous.epoch + 1,
        len: targetText.length,
      }));
    }
  }

  // Reduced motion skips the progressive reveal and shows the full text: the
  // person's setting, followed live so a change mid-stream takes effect, or a
  // theme's reducedMotion: 'always'.
  const reducesMotion = useReducesMotion();

  // Syncs the revealed text with an animation-frame clock while the text
  // streams.
  useEffect(() => {
    if (!isStreaming || speed === 'instant' || reducesMotion) {
      return;
    }

    function tick(now: number) {
      const elapsed = now - lastTickRef.current;
      if (elapsed >= tickMs) {
        lastTickRef.current = now;
        const target = targetRef.current;
        setRevealed(previous => {
          const currentLen =
            previous.epoch === restart.epoch ? previous.len : restart.len;
          if (currentLen >= target.length) {
            return previous;
          }
          return {
            epoch: restart.epoch,
            len: Math.min(currentLen + charsPerTick, target.length),
          };
        });
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
  }, [isStreaming, charsPerTick, tickMs, speed, reducesMotion, restart]);

  if (!isStreaming || speed === 'instant' || reducesMotion) {
    return targetText;
  }

  return targetText.slice(0, snapToGraphemeBoundary(targetText, displayedLen));
}
