// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file stubMatchMedia.ts
 * @input Uses vitest
 * @output stubMatchMedia — a query-aware window.matchMedia stub
 * @position Shared test helper; imported by component tests that render below
 *   a breakpoint while also exercising motion-sensitive behaviour
 *
 * jsdom has no matchMedia, so tests stub it. The usual stub answers every query
 * with one boolean:
 *
 *   vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({matches: true, ...}))
 *
 * That is enough to put AppShell below its breakpoint — and it silently also
 * matches `prefers-reduced-motion`, rerouting any code that branches on motion.
 * MobileNav's close delay is capped at 0 under reduced motion, so a suite using
 * the blanket stub runs against an immediate close while its test names claim
 * it is exercising the real delay. The failure mode is invisible: every test
 * still passes.
 *
 * So the answers are separate knobs here. `reduceMotion` answers
 * `prefers-reduced-motion` only; `pointer` answers the pointer queries (a
 * blanket `true` would also make the pointer coarse, rerouting anything that
 * behaves differently under a finger); `matches` answers everything else
 * (breakpoint width queries, which tests below a breakpoint want to be true).
 *
 * SYNC: When modified, update this header.
 */

import {vi} from 'vitest';

export interface StubMatchMediaOptions {
  /** Whether the user prefers reduced motion. */
  reduceMotion?: boolean;
  /** The primary pointer: `(pointer: coarse)` matches only for `'coarse'`. */
  pointer?: 'fine' | 'coarse';
  /** Answer for every other query — width breakpoints, hover, etc. */
  matches?: boolean;
}

/** Answer a `pointer` query, or null if it isn't one. */
function answerPointer(
  query: string,
  pointer: 'fine' | 'coarse',
): boolean | null {
  if (query.includes('pointer: coarse')) {
    return pointer === 'coarse';
  }
  if (query.includes('pointer: fine')) {
    return pointer === 'fine';
  }
  return null;
}

/**
 * Answer a `prefers-reduced-motion` query, or null if it isn't one.
 *
 * The preference has two spellings and they are opposites, so a single
 * `includes('prefers-reduced-motion')` would answer `no-preference` with the
 * value meant for `reduce` — the same answer-without-reading mistake this
 * helper exists to prevent. Core only queries `reduce` today (MobileNav,
 * Carousel); handling both is what keeps that true if one changes.
 */
function answerReducedMotion(
  query: string,
  reduceMotion: boolean,
): boolean | null {
  if (query.includes('prefers-reduced-motion: reduce')) {
    return reduceMotion;
  }
  if (query.includes('prefers-reduced-motion: no-preference')) {
    return !reduceMotion;
  }
  // Bare `(prefers-reduced-motion)` is true for any value other than
  // no-preference, i.e. the same as `reduce`.
  if (query.includes('prefers-reduced-motion')) {
    return reduceMotion;
  }
  return null;
}

/**
 * Install a `window.matchMedia` stub whose answer depends on the query.
 *
 * Call from `beforeEach` (or inside a test that needs different motion
 * settings) and pair with `vi.unstubAllGlobals()` in `afterEach`.
 *
 * @example
 * ```
 * beforeEach(() => {
 *   stubMatchMedia({reduceMotion: false});
 * });
 * ```
 */
export function stubMatchMedia({
  reduceMotion = false,
  pointer = 'fine',
  matches = true,
}: StubMatchMediaOptions = {}): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches:
        answerReducedMotion(query, reduceMotion) ??
        answerPointer(query, pointer) ??
        matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}
