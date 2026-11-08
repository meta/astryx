// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useTruncation.test.tsx
 * Tests for useTruncation
 */

import {act, render, screen, waitFor} from '@testing-library/react';
import {afterEach, describe, it, expect, vi} from 'vitest';
import {useCallback} from 'react';
import {useTruncation} from './useTruncation';

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

    // Measuring inside React's commit forces a style and layout pass per text
    // on a page that mounts many; after the commit, every text reads together.
    it('measures after the commit, not inside it', async () => {
      const observed: Element[] = [];
      vi.stubGlobal(
        'ResizeObserver',
        class {
          observe(target: Element) {
            observed.push(target);
          }
          unobserve() {}
          disconnect() {}
        },
      );

      const {unmount} = render(<Probe text="a status line" />);

      // Observed, but not measured during the commit.
      expect(observed).toHaveLength(1);
      expect(screen.getByTestId('full-text')).toHaveTextContent('');

      await act(async () => {});

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
      function Unclamping({maxLines}: {maxLines: number}) {
        const truncation = useTruncation({maxLines});
        return (
          <>
            <span ref={truncation.ref}>overflowing text</span>
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
