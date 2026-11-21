// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChatVirtualizerViewportResize.test.tsx
 * @input ChatVirtualizer attached to the page scroller, a stand-in window
 *   width, and ResizeObserver entries delivered by hand
 * @output How many correction passes, and how many window reads, a viewport
 *   change causes
 * @position Unit coverage for the page scroller's viewport path; jsdom has no
 *   layout and no ResizeObserver, so the test delivers the entries a browser
 *   sends with each resize
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

describe('ChatVirtualizer on the page scroller: viewport changes', () => {
  let el: HTMLElement;
  let passes = 0;
  let widthReads = 0;
  let width = 1000;
  let height = 400;
  let scrolling: PropertyDescriptor | undefined;
  let innerWidth: PropertyDescriptor | undefined;

  beforeEach(() => {
    passes = 0;
    widthReads = 0;
    width = 1000;
    height = 400;
    el = document.createElement('div');
    // Each correction pass reads the scroller's size once.
    Object.defineProperty(el, 'clientHeight', {
      configurable: true,
      get: () => {
        passes++;
        return height;
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
      get: () => {
        widthReads++;
        return width;
      },
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
    widthReads = 0;
  }

  /** The hidden viewport-sized box the page scroller observes, if any. */
  function viewportProbe(): Element | undefined {
    return [...observed.keys()].find(
      target =>
        target !== el &&
        (target as HTMLElement).dataset.pkey === undefined &&
        target.getAttribute('aria-hidden') === 'true',
    );
  }

  /** One ResizeObserver delivery, as the browser sends it after layout. */
  function deliver(targets: (Element | undefined)[]): void {
    act(() => {
      for (const target of targets) {
        if (target === undefined) {
          continue;
        }
        observed.get(target)?.({
          target,
          borderBoxSize: [{blockSize: height, inlineSize: width}],
          contentRect: {height, width},
        } as unknown as ResizeObserverEntry);
      }
    });
  }

  /**
   * One frame of a viewport change: the window fires resize, then the
   * observer reports the boxes that changed size. A width change resizes the
   * scroller's box too; a height-only change, as an iOS toolbar sends,
   * resizes only the viewport.
   */
  async function viewportFrame(change: {
    width?: number;
    height?: number;
  }): Promise<number> {
    passes = 0;
    const widthChanged = change.width !== undefined && change.width !== width;
    width = change.width ?? width;
    height = change.height ?? height;
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    await nextFrame();
    deliver(widthChanged ? [el, viewportProbe()] : [viewportProbe()]);
    await act(async () => {
      await Promise.resolve();
    });
    await nextFrame();
    return passes;
  }

  it('observes a hidden viewport-sized box while attached to the page scroller', async () => {
    await mounted();
    expect(viewportProbe()).toBeDefined();
  });

  it('runs one correction pass for a width drag', async () => {
    await mounted();
    expect(await viewportFrame({width: 900})).toBe(1);
  });

  it('runs one correction pass for a height-only change', async () => {
    await mounted();
    expect(await viewportFrame({height: 360})).toBe(1);
  });

  it('runs one correction pass for a height-only change in the frame right after a width change', async () => {
    await mounted();
    width = 900;
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    await nextFrame();
    deliver([el, viewportProbe()]);
    await act(async () => {
      await Promise.resolve();
    });
    const widthPasses = passes;
    passes = 0;
    // The next frame: only the viewport's height changes.
    height = 360;
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    await nextFrame();
    deliver([viewportProbe()]);
    await act(async () => {
      await Promise.resolve();
    });
    await nextFrame();
    await nextFrame();
    expect([widthPasses, passes]).toEqual([1, 1]);
  });

  it('runs one correction pass in each frame of a height-only, width, then height-only sequence', async () => {
    await mounted();
    const counts = [
      await viewportFrame({height: 360}),
      await viewportFrame({width: 900}),
      await viewportFrame({height: 400}),
    ];
    expect(counts).toEqual([1, 1, 1]);
  });

  it('reads no window size during a viewport change', async () => {
    await mounted();
    await viewportFrame({width: 900});
    await viewportFrame({height: 360});
    expect(widthReads).toBe(0);
  });

  it('runs one correction pass when a toolbar change fires several resizes in one frame', async () => {
    await mounted();
    passes = 0;
    height = 360;
    act(() => {
      for (let i = 0; i < 3; i++) {
        window.dispatchEvent(new Event('resize'));
      }
    });
    await nextFrame();
    deliver([viewportProbe()]);
    await act(async () => {
      await Promise.resolve();
    });
    await nextFrame();
    expect(passes).toBe(1);
  });
});
