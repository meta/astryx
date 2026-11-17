// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useStreamingText example shows the hook's reveal: clicking Regenerate
 * starts a bursty fake stream, the displayed text grows steadily while
 * streaming, and the full text is shown once the stream ends.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import UseStreamingTextHookUsage from '../../assets/templates/blocks/components/Hooks/useStreamingTextHookUsage';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;

const FULL_TEXT =
  'Astryx hooks keep behavior reusable while components keep visuals consistent. Streaming text arrives in bursts; the hook smooths it into a steady reveal.';

let root: Root | null = null;
let container: HTMLElement;

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const FIRST_CHUNK = 'Astryx hooks keep behavior reusable ';

// The reply is the text element right after the "Assistant response" heading.
const replyText = () => {
  const heading = Array.from(container.querySelectorAll('*')).find(
    el => el.children.length === 0 && el.textContent === 'Assistant response',
  );
  return heading?.nextElementSibling?.textContent ?? '';
};

const pressRegenerate = () => {
  const button = Array.from(container.querySelectorAll('button')).find(
    b => b.textContent === 'Regenerate' || b.textContent === 'Streaming…',
  );
  act(() => button?.click());
};

describe('useStreamingTextHookUsage example', () => {
  it('reveals text progressively while streaming and snaps to full when done', () => {
    root = createRoot(container);
    act(() => root!.render(<UseStreamingTextHookUsage />));
    // Before Regenerate: nothing has streamed.
    expect(replyText()).toBe('');

    pressRegenerate();

    // The first chunk lands at 350 ms. A few frames later the hook has revealed
    // only part of it; without the hook the whole chunk would show at once.
    act(() => vi.advanceTimersByTime(350));
    act(() => vi.advanceTimersByTime(50));
    const partial = replyText();
    expect(partial.length).toBeGreaterThan(0);
    expect(partial.length).toBeLessThan(FIRST_CHUNK.length);
    expect(FIRST_CHUNK.startsWith(partial)).toBe(true);

    // After the last chunk the stream ends and the full text shows at once.
    act(() => vi.advanceTimersByTime(350 * 4 + 100));
    expect(replyText()).toBe(FULL_TEXT);
  });

  it('restarts cleanly when Regenerate is pressed mid-stream', () => {
    root = createRoot(container);
    act(() => root!.render(<UseStreamingTextHookUsage />));
    pressRegenerate();
    act(() => vi.advanceTimersByTime(800));
    pressRegenerate();
    act(() => vi.advanceTimersByTime(350 * 4 + 100));
    // One stream, in order: no repeated or interleaved chunks.
    expect(replyText()).toBe(FULL_TEXT);
    expect(
      Array.from(container.querySelectorAll('button')).some(
        b => b.textContent === 'Regenerate',
      ),
    ).toBe(true);
  });
});
