// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useStreamingText example shows the hook's reveal: clicking Regenerate
// starts a bursty fake stream, the displayed text grows steadily while
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

const bodyText = () =>
  Array.from(container.querySelectorAll('*'))
    .map(el => el.textContent ?? '')
    .join(' ');

describe('useStreamingTextHookUsage example', () => {
  it('reveals text progressively while streaming and snaps to full when done', async () => {
    root = createRoot(container);
    act(() => root!.render(<UseStreamingTextHookUsage />));
    // Before Regenerate: nothing has streamed, the card is empty of body text.
    expect(bodyText()).not.toContain('Astryx hooks');

    const regenerate = () => {
      const button = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent === 'Regenerate',
      );
      act(() => button?.click());
    };
    regenerate();

    // Early in the stream: some but not all of the text has been revealed.
    act(() => vi.advanceTimersByTime(400));
    const partial = bodyText();
    expect(partial).toContain('A');
    expect(partial).not.toContain(FULL_TEXT);

    // After the stream ends: the full text is displayed at once.
    act(() => vi.advanceTimersByTime(350 * 5 + 2000));
    expect(bodyText()).toContain(FULL_TEXT);
  });
});
