// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {renderHook, act} from '@testing-library/react';
import {
  Suspense,
  createElement,
  startTransition,
  use,
  type ReactNode,
} from 'react';
import {snapToGraphemeBoundary, useStreamingText} from './useStreamingText';

describe('useStreamingText', () => {
  let rafCallbacks: ((time: number) => void)[];
  let originalRAF: typeof requestAnimationFrame;
  let originalCAF: typeof cancelAnimationFrame;
  let originalMatchMedia: typeof window.matchMedia | undefined;
  // Toggled per-test to drive the reduced-motion media query. Reset in
  // beforeEach so the preference never leaks between tests.
  let prefersReducedMotion: boolean;

  beforeEach(() => {
    rafCallbacks = [];
    originalRAF = globalThis.requestAnimationFrame;
    originalCAF = globalThis.cancelAnimationFrame;
    globalThis.requestAnimationFrame = vi.fn(cb => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    globalThis.cancelAnimationFrame = vi.fn();

    // Mock matchMedia for useTheme → useMediaQuery and the hook's own
    // reduced-motion read. Only the reduced-motion query reflects
    // `prefersReducedMotion`; theme media queries always report no match.
    prefersReducedMotion = false;
    originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('prefers-reduced-motion')
          ? prefersReducedMotion
          : false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRAF;
    globalThis.cancelAnimationFrame = originalCAF;
    // Restore matchMedia so the mock never leaks into other suites. jsdom
    // has no matchMedia by default, so drop the property when there was none.
    if (originalMatchMedia === undefined) {
      // @ts-expect-error jsdom leaves matchMedia undefined by default
      delete window.matchMedia;
    } else {
      window.matchMedia = originalMatchMedia;
    }
  });

  it('returns full text when not streaming', () => {
    const {result} = renderHook(() => useStreamingText('Hello world', false));
    expect(result.current).toBe('Hello world');
  });

  it('returns full text with instant speed', () => {
    const {result} = renderHook(() =>
      useStreamingText('Hello world', true, {speed: 'instant'}),
    );
    expect(result.current).toBe('Hello world');
  });

  it('snaps to full text immediately when reduced motion is preferred', () => {
    prefersReducedMotion = true;
    const {result} = renderHook(() => useStreamingText('Hello world', true));
    expect(result.current).toBe('Hello world');
  });

  it('keeps snapping to the full text on updates when reduced motion is preferred', () => {
    prefersReducedMotion = true;
    const {result, rerender} = renderHook(
      ({text}) => useStreamingText(text, true),
      {initialProps: {text: 'Hello'}},
    );

    expect(result.current).toBe('Hello');

    // A later chunk arrives — it should appear in full, not reveal char-by-char.
    rerender({text: 'Hello world'});
    expect(result.current).toBe('Hello world');
  });

  it('starts with empty string when streaming', () => {
    const {result} = renderHook(() => useStreamingText('Hello world', true));
    expect(result.current).toBe('');
  });

  it('snaps to full text when streaming ends', () => {
    const {result, rerender} = renderHook(
      ({text, streaming}) => useStreamingText(text, streaming),
      {initialProps: {text: 'Hello world', streaming: true}},
    );

    expect(result.current).toBe('');

    // Stop streaming
    rerender({text: 'Hello world', streaming: false});
    expect(result.current).toBe('Hello world');
  });

  it('resets when target text clears', () => {
    const {result, rerender} = renderHook(
      ({text, streaming}) => useStreamingText(text, streaming),
      {initialProps: {text: 'Hello', streaming: false}},
    );

    expect(result.current).toBe('Hello');

    // Clear text (new message)
    rerender({text: '', streaming: true});
    expect(result.current).toBe('');
  });

  describe('with a render React discards', () => {
    // A transition that suspends for good: React renders the new props, then
    // keeps the committed tree and never commits that render.
    const forever = new Promise<never>(() => {});
    function Forever(): null {
      use(forever);
      return null;
    }
    let isPending = false;
    function Discardable({children}: {children: ReactNode}) {
      return createElement(
        Suspense,
        {fallback: null},
        children,
        isPending ? createElement(Forever) : null,
      );
    }
    let frame = 0;
    function nextFrame() {
      const cb = rafCallbacks.pop();
      frame += 1;
      if (cb) {
        act(() => cb(performance.now() + frame * 20));
      }
    }
    async function discard(update: () => void) {
      isPending = true;
      await act(async () => {
        startTransition(update);
      });
      isPending = false;
    }

    it('keeps revealing from where it stood when the discarded render clears the text', async () => {
      const text = 'A streamed answer, revealed ten code units per tick.';
      const {result, rerender} = renderHook(
        ({text, streaming}) => useStreamingText(text, streaming),
        {initialProps: {text, streaming: true}, wrapper: Discardable},
      );
      nextFrame();
      nextFrame();
      const shown = result.current.length;
      expect(shown).toBeGreaterThan(10);

      await discard(() => rerender({text: '', streaming: true}));
      // The committed stream goes on: its next chunk, then a frame.
      rerender({text: `${text} More.`, streaming: true});
      nextFrame();

      expect(result.current.length).toBeGreaterThan(shown);
    });

    it('keeps revealing at its pace when the discarded render ends the stream', async () => {
      const text = 'A streamed answer, revealed ten code units per tick.';
      const {result, rerender} = renderHook(
        ({text, streaming}) => useStreamingText(text, streaming),
        {initialProps: {text, streaming: true}, wrapper: Discardable},
      );
      nextFrame();
      const shown = result.current.length;
      expect(shown).toBeGreaterThan(0);
      expect(shown).toBeLessThan(text.length);

      await discard(() => rerender({text, streaming: false}));
      rerender({text: `${text} More.`, streaming: true});
      nextFrame();

      // One tick's worth further on, not the whole text at once.
      expect(result.current.length).toBeLessThanOrEqual(shown * 2);
    });
  });

  it('progressively reveals text through animation frames', () => {
    const {result} = renderHook(() =>
      useStreamingText('Hello, world! This is a test.', true),
    );

    expect(result.current).toBe('');

    // Fire animation frames
    let lastLen = 0;
    for (let i = 0; i < 20; i++) {
      if (rafCallbacks.length > 0) {
        const cb = rafCallbacks.pop()!;
        act(() => cb(performance.now() + i * 20));
      }
      expect(result.current.length).toBeGreaterThanOrEqual(lastLen);
      lastLen = result.current.length;
    }

    expect(result.current.length).toBeGreaterThan(0);
  });

  it('advances monotonically without stalls or backwards jumps', () => {
    const targetText =
      'Hello **world**, this is `code` and [a link](http://example.com).';
    const {result} = renderHook(() => useStreamingText(targetText, true));

    expect(result.current).toBe('');

    // Fire many animation frames — the revealed length should only increase
    const lengths: number[] = [0];
    for (let i = 0; i < 50; i++) {
      if (rafCallbacks.length > 0) {
        const cb = rafCallbacks.pop()!;
        act(() => cb(performance.now() + i * 20));
      }
      const len = result.current.length;
      expect(len).toBeGreaterThanOrEqual(lengths[lengths.length - 1]);
      lengths.push(len);
    }

    // Should have made progress (not stuck at 0)
    expect(lengths[lengths.length - 1]).toBeGreaterThan(0);

    // Should never have gone backwards
    for (let i = 1; i < lengths.length; i++) {
      expect(lengths[i]).toBeGreaterThanOrEqual(lengths[i - 1]);
    }
  });

  it('does not stall on markdown syntax characters', () => {
    // Text with lots of markdown syntax that previously caused stalls
    const targetText =
      '- **bold** and *italic* with `code` and [link](url) and ~~strike~~';
    const {result} = renderHook(() => useStreamingText(targetText, true));

    // Fire enough frames to drain the entire text
    for (let i = 0; i < 100; i++) {
      if (rafCallbacks.length > 0) {
        const cb = rafCallbacks.pop()!;
        act(() => cb(performance.now() + i * 60));
      }
    }

    // With enough frames and time elapsed, should have revealed everything
    // (or close to it — the hook drains charsPerTick per tickMs)
    expect(result.current.length).toBeGreaterThan(targetText.length * 0.5);
  });

  it('never reveals a tick boundary landing mid-surrogate-pair or mid-ZWJ-emoji-sequence (#4779)', () => {
    // natural speed advances 10 UTF-16 code units per tick. 9 ASCII chars
    // (indices 0-8) followed by a 4-person ZWJ family emoji (indices 9-19,
    // one grapheme cluster, 11 code units) means the first tick's raw
    // boundary (index 10) lands one code unit into the family emoji's first
    // surrogate pair -- exactly the failure case from the issue.
    const family = '\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}';
    const targetText = 'a'.repeat(9) + family + 'end';
    const {result} = renderHook(() => useStreamingText(targetText, true));

    expect(rafCallbacks.length).toBeGreaterThan(0);
    const cb = rafCallbacks.pop()!;
    act(() => cb(performance.now() + 20));

    // Without the fix this would be 'a'.repeat(9) + a lone high surrogate
    // (renders as U+FFFD). With the fix, the whole not-yet-complete family
    // cluster is held back rather than rendering a broken glyph.
    expect(result.current).toBe('a'.repeat(9));
  });
});

describe('snapToGraphemeBoundary', () => {
  it('does not split a surrogate pair', () => {
    const text = 'a\u{1F389}b'; // 🎉 is a surrogate pair: indices 1 (high) and 2 (low)
    expect(snapToGraphemeBoundary(text, 2)).toBe(1);
    expect(snapToGraphemeBoundary(text, 1)).toBe(1);
  });

  it('does not split a ZWJ emoji sequence', () => {
    const family = '\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}';
    const text = 'x' + family + 'y';
    const familyStart = 1;
    const familyEnd = 1 + family.length;
    for (let offset = familyStart + 1; offset < familyEnd; offset++) {
      expect(snapToGraphemeBoundary(text, offset)).toBe(familyStart);
    }
  });

  it('leaves boundary offsets (start, end, plain-ASCII midpoints) unchanged', () => {
    const text = 'hello';
    expect(snapToGraphemeBoundary(text, 0)).toBe(0);
    expect(snapToGraphemeBoundary(text, 5)).toBe(5);
    expect(snapToGraphemeBoundary(text, 3)).toBe(3);
  });
});
