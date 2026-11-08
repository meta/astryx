// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useTruncation.test.tsx
 * Tests for useTruncation
 */

import {act, render, screen, waitFor} from '@testing-library/react';
import {afterEach, describe, it, expect, vi} from 'vitest';
import {useCallback, useEffect} from 'react';
import type * as layoutEffects from '../hooks/useIsomorphicLayoutEffect';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {useHeldTruncation, useTruncation} from './useTruncation';

// The shipped layout effect, observable: a test counts who runs one.
vi.mock('../hooks/useIsomorphicLayoutEffect', async importOriginal => {
  const actual = await importOriginal<typeof layoutEffects>();
  return {
    ...actual,
    useIsomorphicLayoutEffect: vi.fn(actual.useIsomorphicLayoutEffect),
  };
});

function Probe({text}: {text: string}) {
  const truncation = useTruncation({maxLines: 1});
  return (
    <>
      <span ref={truncation.ref}>{text}</span>
      <output data-testid="full-text">{truncation.fullText}</output>
    </>
  );
}

// A status line at a fixed width never resizes when its message changes, so
// the tooltip text must follow the content, not only the element's size.
describe('useTruncation', () => {
  it('re-measures when the text changes without a resize', async () => {
    const {rerender} = render(<Probe text="planning the first step" />);
    expect(screen.getByTestId('full-text')).toHaveTextContent(
      'planning the first step',
    );

    rerender(<Probe text="writing the second step" />);

    await waitFor(() =>
      expect(screen.getByTestId('full-text')).toHaveTextContent(
        'writing the second step',
      ),
    );
  });

  describe('first measurement', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    // Measuring inside React's commit, or in a microtask after it, forces a
    // layout pass on a page that mounts many texts. A newly observed element
    // waits for the observer's first notification, sent after layout.
    it("takes a new text's first measurement from the observer's first notification", async () => {
      const observed: Element[] = [];
      let notify: ResizeObserverCallback | null = null;
      vi.stubGlobal(
        'ResizeObserver',
        class {
          constructor(callback: ResizeObserverCallback) {
            notify = callback;
          }
          observe(target: Element) {
            observed.push(target);
          }
          unobserve() {}
          disconnect() {}
        },
      );

      const {unmount} = render(<Probe text="a status line" />);

      // Observed, but measured neither in the commit nor in a microtask.
      expect(observed).toHaveLength(1);
      await act(async () => {});
      expect(screen.getByTestId('full-text')).toHaveTextContent('');

      act(() => {
        notify?.(
          [{target: observed[0]} as ResizeObserverEntry],
          {} as ResizeObserver,
        );
      });
      expect(screen.getByTestId('full-text')).toHaveTextContent(
        'a status line',
      );
      unmount();
    });

    // FR4/PR1: with measuring turned off before the first measurement runs,
    // nothing is measured and the hook reports no truncation.
    it('skips the first measurement when measuring turns off in the same task', async () => {
      vi.stubGlobal(
        'ResizeObserver',
        class {
          observe() {}
          unobserve() {}
          disconnect() {}
        },
      );
      const proto = window.HTMLElement.prototype;
      const scrollWidth = Object.getOwnPropertyDescriptor(proto, 'scrollWidth');
      const offsetWidth = Object.getOwnPropertyDescriptor(proto, 'offsetWidth');
      Object.defineProperty(proto, 'scrollWidth', {
        configurable: true,
        get: () => 400,
      });
      Object.defineProperty(proto, 'offsetWidth', {
        configurable: true,
        get: () => 100,
      });
      const {observeResize} = await import('../utils/sharedResizeObserver');
      function Unclamping({maxLines}: {maxLines: number}) {
        const truncation = useTruncation({maxLines});
        const {ref} = truncation;
        // Another subscriber watches the span first, so the hook's first
        // measurement takes the microtask path, which the guard decides.
        const attach = useCallback(
          (element: HTMLElement | null) => {
            if (element) {
              observeResize(element, () => {});
            }
            ref(element);
          },
          [ref],
        );
        return (
          <>
            <span ref={attach}>overflowing text</span>
            <output data-testid="state">
              {String(truncation.isTruncated)}|{truncation.fullText}
            </output>
          </>
        );
      }
      try {
        // Measuring turns off in the same task, before the first measurement.
        const {rerender, unmount} = render(<Unclamping maxLines={1} />);
        rerender(<Unclamping maxLines={0} />);
        await act(async () => {});
        expect(screen.getByTestId('state')).toHaveTextContent(/^false\|$/);
        unmount();
      } finally {
        if (scrollWidth) {
          Object.defineProperty(proto, 'scrollWidth', scrollWidth);
        }
        if (offsetWidth) {
          Object.defineProperty(proto, 'offsetWidth', offsetWidth);
        }
      }
    });

    // The browser sends no second first-notification for an element the
    // shared observer already watches, so the first measurement cannot wait
    // for one.
    it('measures an element another subscriber already observes', async () => {
      vi.stubGlobal(
        'ResizeObserver',
        class {
          observe() {}
          unobserve() {}
          disconnect() {}
        },
      );
      const {observeResize} = await import('../utils/sharedResizeObserver');
      const watched = document.createElement('span');
      function Shared({text}: {text: string}) {
        const truncation = useTruncation({maxLines: 1});
        const {ref} = truncation;
        const attach = useCallback(
          (element: HTMLElement | null) => {
            if (element && element !== watched) {
              observeResize(element, () => {});
            }
            ref(element);
          },
          [ref],
        );
        return (
          <>
            <span ref={attach}>{text}</span>
            <output data-testid="full-text">{truncation.fullText}</output>
          </>
        );
      }
      const {unmount} = render(<Shared text="already watched" />);
      await act(async () => {});
      expect(screen.getByTestId('full-text')).toHaveTextContent(
        'already watched',
      );
      unmount();
    });
  });

  describe('useHeldTruncation', () => {
    // The caller measures after each commit, as Lightbox does after layout.
    function HeldProbe({
      isHeld,
      height,
      measures = true,
    }: {
      isHeld: boolean;
      height: number;
      measures?: boolean;
    }) {
      const truncation = useHeldTruncation({maxLines: 2, isHeld});
      const {measure} = truncation;
      useEffect(() => {
        if (measures) {
          measure();
        }
      });
      return (
        <>
          <span ref={truncation.ref} data-height={height}>
            text
          </span>
          <output data-testid="truncated">
            {String(truncation.isTruncated)}
          </output>
        </>
      );
    }

    // jsdom lays nothing out: the text's content height is its scrollHeight,
    // which each case sets through the element's data-height.
    function stubHeights() {
      const scrollHeight = vi
        .spyOn(HTMLElement.prototype, 'scrollHeight', 'get')
        .mockImplementation(function (this: HTMLElement) {
          return Number(this.dataset.height ?? 0);
        });
      const offsetHeight = vi
        .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
        .mockImplementation(function (this: HTMLElement) {
          return this.dataset.height == null ? 0 : 48;
        });
      return () => {
        scrollHeight.mockRestore();
        offsetHeight.mockRestore();
      };
    }

    // Text and Heading run plain useTruncation in every instance, so only the
    // held variant may add a step to each render.
    it('adds a layout effect only to the held variant, never to useTruncation', () => {
      const layoutEffect = vi.mocked(useIsomorphicLayoutEffect);
      layoutEffect.mockClear();
      render(<Probe text="a status line" />);
      expect(layoutEffect).not.toHaveBeenCalled();
      render(<HeldProbe isHeld={false} height={40} />);
      expect(layoutEffect).toHaveBeenCalled();
    });

    it('reads nothing by itself: its caller measures', () => {
      const restore = stubHeights();
      const reads = vi.mocked(
        Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight')!
          .get!,
      );
      try {
        reads.mockClear();
        render(<HeldProbe isHeld={false} height={120} measures={false} />);
        expect(reads).not.toHaveBeenCalled();
        expect(screen.getByTestId('truncated')).toHaveTextContent('false');
      } finally {
        restore();
      }
    });

    it('keeps its last answer while held, and its caller measures it again on release', async () => {
      const restore = stubHeights();
      try {
        const {rerender} = render(<HeldProbe isHeld={false} height={120} />);
        await waitFor(() =>
          expect(screen.getByTestId('truncated')).toHaveTextContent('true'),
        );
        // Held, the text shows every line: no measurement changes the answer.
        rerender(<HeldProbe isHeld={true} height={48} />);
        await act(async () => {
          await Promise.resolve();
        });
        expect(screen.getByTestId('truncated')).toHaveTextContent('true');
        // Released over text that now fits, it measures again.
        rerender(<HeldProbe isHeld={false} height={40} />);
        await waitFor(() =>
          expect(screen.getByTestId('truncated')).toHaveTextContent('false'),
        );
      } finally {
        restore();
      }
    });
  });

  describe('content observation', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('shares one observer across every truncating instance', () => {
      const NativeMutationObserver = globalThis.MutationObserver;
      let created = 0;
      vi.stubGlobal(
        'MutationObserver',
        class extends NativeMutationObserver {
          constructor(callback: MutationCallback) {
            super(callback);
            created += 1;
          }
        },
      );

      render(
        <>
          {Array.from({length: 50}, (_, index) => (
            <Probe key={index} text={`cell ${index}`} />
          ))}
        </>,
      );

      expect(created).toBe(1);
    });
  });
});
