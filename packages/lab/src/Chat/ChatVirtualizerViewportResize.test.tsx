// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChatVirtualizerViewportResize.test.tsx
 * @input ChatVirtualizer attached to the page scroller, a stand-in window
 *   width, and ResizeObserver entries delivered by hand
 * @output How many correction passes one window resize runs
 * @position Unit coverage for the page scroller's resize path; jsdom has no
 *   layout and no ResizeObserver, so the test delivers the entries
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {act, render} from '@testing-library/react';
import {ChatVirtualizer} from './ChatVirtualizer';

const observed = new Map<Element, (entry: ResizeObserverEntry) => void>();
vi.mock('@astryxdesign/core/utils', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@astryxdesign/core/utils')>();
  return {
    ...actual,
    observeResize: (
      element: Element,
      callback: (entry: ResizeObserverEntry) => void,
    ) => {
      observed.set(element, callback);
      // The registration's own call carries no box.
      callback({target: element} as ResizeObserverEntry);
      return () => {
        observed.delete(element);
      };
    },
  };
});

type Row = {id: number; text: string};
const rows = (n: number): Row[] =>
  Array.from({length: n}, (_, id) => ({id, text: `Message ${id}`}));

const nextFrame = (): Promise<void> =>
  act(
    () =>
      new Promise<void>(resolve => {
        requestAnimationFrame(() => resolve());
      }),
  );

describe('ChatVirtualizer on the page scroller: window resize', () => {
  let el: HTMLElement;
  let passes = 0;
  let width = 1000;
  let scrolling: PropertyDescriptor | undefined;
  let innerWidth: PropertyDescriptor | undefined;

  beforeEach(() => {
    passes = 0;
    width = 1000;
    el = document.createElement('div');
    // Each correction pass reads the scroller's size once.
    Object.defineProperty(el, 'clientHeight', {
      configurable: true,
      get: () => {
        passes++;
        return 400;
      },
    });
    Object.defineProperty(el, 'scrollHeight', {
      configurable: true,
      get: () => 1e6,
    });
    document.body.appendChild(el);
    scrolling = Object.getOwnPropertyDescriptor(
      Document.prototype,
      'scrollingElement',
    );
    Object.defineProperty(document, 'scrollingElement', {
      configurable: true,
      get: () => el,
    });
    innerWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      get: () => width,
    });
  });

  afterEach(() => {
    delete (document as unknown as Record<string, unknown>).scrollingElement;
    if (scrolling !== undefined) {
      Object.defineProperty(Document.prototype, 'scrollingElement', scrolling);
    }
    if (innerWidth !== undefined) {
      Object.defineProperty(window, 'innerWidth', innerWidth);
    }
    el.remove();
  });

  async function mounted(): Promise<void> {
    render(
      <ChatVirtualizer<Row>
        data={rows(60)}
        getRowKey={m => String(m.id)}
        renderItem={({item}) => <span>{item.text}</span>}
        estimatedItemSize={100}
        scrollElement={el}
      />,
    );
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 40));
    });
    passes = 0;
  }

  /** The scroller's own ResizeObserver entry, as the browser sends it. */
  function deliverScrollerEntry(): void {
    act(() => {
      observed.get(el)?.({
        target: el,
        borderBoxSize: [{blockSize: 6000, inlineSize: width}],
        contentRect: {height: 6000, width},
      } as unknown as ResizeObserverEntry);
    });
  }

  it('runs one correction pass for a width drag, whose scroller entry also arrives', async () => {
    await mounted();
    // One frame of a drag: the width changes, so the window fires resize and
    // the page scroller's box resizes too.
    width = 900;
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    await nextFrame();
    deliverScrollerEntry();
    await act(async () => {
      await Promise.resolve();
    });
    await nextFrame();
    await nextFrame();
    expect(passes).toBe(1);
  });

  it('runs one correction pass for a height-only change, which gives the scroller no entry', async () => {
    await mounted();
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    await nextFrame();
    await nextFrame();
    expect(passes).toBe(1);
  });

  it('runs one correction pass in each frame of a height-only, width, then height-only sequence', async () => {
    await mounted();
    const counts: number[] = [];

    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    await nextFrame();
    await nextFrame();
    counts.push(passes);
    passes = 0;

    width = 900;
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    await nextFrame();
    deliverScrollerEntry();
    await act(async () => {
      await Promise.resolve();
    });
    await nextFrame();
    await nextFrame();
    counts.push(passes);
    passes = 0;

    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    await nextFrame();
    await nextFrame();
    counts.push(passes);

    expect(counts).toEqual([1, 1, 1]);
  });

  it('runs one correction pass, one frame late, when a width change gives the scroller no entry', async () => {
    await mounted();
    width = 900;
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    await nextFrame();
    expect(passes).toBe(0);
    await nextFrame();
    await nextFrame();
    expect(passes).toBe(1);
  });
});
