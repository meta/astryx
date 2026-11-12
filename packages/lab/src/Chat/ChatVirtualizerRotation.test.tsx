// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChatVirtualizerRotation.test.tsx
 * @input ChatVirtualizer attached to the page scroller, a coarse pointer, and
 *   the events and ResizeObserver entries a phone sends when it rotates
 * @output Which row the view holds after a rotation, whether follow-at-end
 *   survives it, and whether a finger scroll still owns the position
 * @position Unit coverage for rotation on the page scroller; jsdom has no
 *   layout and no ResizeObserver, so the test plays the browser's part
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {act, render} from '@testing-library/react';
import {TOUCH_QUERY} from '@astryxdesign/core/internal/touch';
import {ChatVirtualizer} from './ChatVirtualizer';

const observed = new Map<Element, (entry: ResizeObserverEntry) => void>();
/** The layout model's height for a row, or null for anything else. */
let rowSizeOf: (element: Element) => number | null = () => null;
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
      // As in a browser, a newly observed row reports its size after the
      // next layout.
      requestAnimationFrame(() => {
        const blockSize = rowSizeOf(element);
        if (blockSize === null || observed.get(element) !== callback) {
          return;
        }
        callback({
          target: element,
          borderBoxSize: [{blockSize, inlineSize: 400}],
          contentRect: {height: blockSize, width: 400},
        } as unknown as ResizeObserverEntry);
      });
      return () => {
        observed.delete(element);
      };
    },
  };
});

type Row = {id: number; text: string};
const rows = (n: number): Row[] =>
  Array.from({length: n}, (_, id) => ({id, text: `Message ${id}`}));

const ROW = 100;
const PORTRAIT_ROW = 150;

const nextFrame = (): Promise<void> =>
  act(
    () =>
      new Promise<void>(resolve => {
        requestAnimationFrame(() => resolve());
      }),
  );

const settled = (): Promise<void> =>
  act(async () => {
    await new Promise(resolve => setTimeout(resolve, 40));
  });

describe('ChatVirtualizer on the page scroller: rotation', () => {
  let el: HTMLElement;
  let viewHeight = 400;
  let rowHeight = ROW;
  // scrollTop writes the list makes, not the browser's in pageScroll().
  let listWrites = 0;
  let isBrowserWrite = false;
  let scrolling: PropertyDescriptor | undefined;
  let restorePointer: () => void = () => {};
  let restoreRects: () => void = () => {};

  /** How tall a child of the list's content block is in the layout model. */
  const heightOfChild = (node: Element): number => {
    if ((node as HTMLElement).dataset.pkey !== undefined) {
      return rowHeight;
    }
    const style = (node as HTMLElement).style;
    return parseFloat(style.height) || parseFloat(style.minHeight) || 0;
  };

  beforeEach(() => {
    viewHeight = 400;
    rowHeight = ROW;
    rowSizeOf = element =>
      (element as HTMLElement).dataset.pkey !== undefined ? rowHeight : null;
    el = document.createElement('div');
    listWrites = 0;
    let top = 0;
    Object.defineProperty(el, 'scrollTop', {
      configurable: true,
      get: () => top,
      set: (value: number) => {
        const moved = value !== top;
        top = value;
        if (isBrowserWrite) {
          return;
        }
        listWrites++;
        // As in a browser, the list's own write that moves the position
        // fires a scroll event on the next frame.
        if (moved) {
          requestAnimationFrame(() => {
            const target = document.scrollingElement === el ? document : el;
            target.dispatchEvent(new Event('scroll'));
          });
        }
      },
    });
    Object.defineProperty(el, 'clientHeight', {
      configurable: true,
      get: () => viewHeight,
    });
    // The page is as tall as the list's content, and never shorter than the
    // view.
    Object.defineProperty(el, 'scrollHeight', {
      configurable: true,
      get: () => {
        const block = [...document.querySelectorAll('[data-pkey]')][0]
          ?.parentElement;
        let total = 0;
        for (const child of block?.children ?? []) {
          total += heightOfChild(child);
        }
        return Math.max(viewHeight, total);
      },
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
    // A phone: Core's finger-scroll watch listens only where the primary
    // pointer is coarse.
    const matchMedia = window.matchMedia;
    const coarse = {
      matches: true,
      media: TOUCH_QUERY,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    } as unknown as MediaQueryList;
    window.matchMedia = (media: string) =>
      media.trim() === TOUCH_QUERY ? coarse : matchMedia(media);
    restorePointer = () => {
      window.matchMedia = matchMedia;
    };
    // A layout model for jsdom: the list's content starts at the top of the
    // page, its spacers are as tall as the list sets them, and every row is
    // rowHeight tall. Each child of the content block sits one scroll offset
    // above where it starts.
    const heightOf = heightOfChild;
    const isContentBlock = (node: Element | null): node is Element =>
      node !== null &&
      node !== document.body &&
      node.firstElementChild?.getAttribute('aria-hidden') === 'true';
    const rect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const parent = this.parentElement;
      if (!isContentBlock(parent)) {
        return rect.call(this);
      }
      let start = 0;
      for (const child of parent.children) {
        if (child === this) {
          break;
        }
        start += heightOf(child);
      }
      const top = start - el.scrollTop;
      const height = heightOf(this);
      return {top, bottom: top + height, left: 0, right: 0, height} as DOMRect;
    };
    const offsetHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'offsetHeight',
    );
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get(this: HTMLElement) {
        return this.dataset.pkey !== undefined
          ? rowHeight
          : (offsetHeight?.get?.call(this) ?? 0);
      },
    });
    restoreRects = () => {
      Element.prototype.getBoundingClientRect = rect;
      if (offsetHeight !== undefined) {
        Object.defineProperty(
          HTMLElement.prototype,
          'offsetHeight',
          offsetHeight,
        );
      }
    };
  });

  afterEach(() => {
    rowSizeOf = () => null;
    restorePointer();
    restoreRects();
    delete (document as unknown as Record<string, unknown>).scrollingElement;
    if (scrolling !== undefined) {
      Object.defineProperty(Document.prototype, 'scrollingElement', scrolling);
    }
    el.remove();
  });

  const list = (data: Row[]) => (
    <ChatVirtualizer<Row>
      data={data}
      getRowKey={m => String(m.id)}
      renderItem={({item}) => <span>{item.text}</span>}
      estimatedItemSize={ROW}
      scrollElement={el}
    />
  );

  /** The row painted at the top of the view. */
  function topRow(): number {
    for (const row of document.querySelectorAll<HTMLElement>('[data-pkey]')) {
      const {top, bottom} = row.getBoundingClientRect();
      if (top <= 0 && bottom > 0) {
        return Number(row.dataset.pkey);
      }
    }
    return -1;
  }

  /**
   * Where a row's top edge is painted, relative to the top of the view, or
   * null when it is not mounted.
   */
  function rowTop(key: number): number | null {
    const row = document.querySelector<HTMLElement>(`[data-pkey="${key}"]`);
    return row === null ? null : row.getBoundingClientRect().top;
  }

  /** Whether the row's top edge sits at the top of the view. */
  function isAtTop(key: number): boolean {
    const top = rowTop(key);
    return top !== null && Math.abs(top) < 2;
  }

  /** The page scrolls: its scroll event fires at the document. */
  function pageScroll(at: number): void {
    isBrowserWrite = true;
    el.scrollTop = at;
    isBrowserWrite = false;
    act(() => {
      document.dispatchEvent(new Event('scroll'));
    });
  }

  /** A finger landing on or lifting from the page's content. */
  function finger(type: string, down: boolean): void {
    const target = el.firstElementChild ?? el;
    const e = new Event(type, {bubbles: true, cancelable: true});
    const entry = {identifier: 1, clientX: 5, clientY: 5, target};
    Object.defineProperty(e, 'changedTouches', {value: [entry]});
    Object.defineProperty(e, 'touches', {value: down ? [entry] : []});
    act(() => {
      target.dispatchEvent(e);
    });
  }

  /**
   * The phone rotates. The window fires resize. A browser that keeps the
   * reader's place moves the page's scrollTop itself and fires a scroll
   * event. After layout, the observer reports the scroller, the viewport box
   * and every mounted row at its new height.
   */
  async function rotate(change: {
    viewHeight: number;
    rowHeight: number;
    browserScrollTop?: number;
  }): Promise<void> {
    viewHeight = change.viewHeight;
    rowHeight = change.rowHeight;
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    if (change.browserScrollTop !== undefined) {
      pageScroll(change.browserScrollTop);
    }
    await nextFrame();
    act(() => {
      for (const [target, callback] of observed) {
        const key = (target as HTMLElement).dataset.pkey;
        const blockSize = key === undefined ? viewHeight : change.rowHeight;
        callback({
          target,
          borderBoxSize: [{blockSize, inlineSize: 400}],
          contentRect: {height: blockSize, width: 400},
        } as unknown as ResizeObserverEntry);
      }
    });
    await act(async () => {
      await Promise.resolve();
    });
    await nextFrame();
    await nextFrame();
  }

  it('keeps the row that was at the top of the view after a rotation to portrait, in history', async () => {
    render(list(rows(200)));
    await settled();
    // The reader scrolls into history: row 50 is at the top.
    pageScroll(50 * ROW);
    await nextFrame();
    expect(topRow()).toBe(50);
    // The browser keeps the reader's place by scaling scrollTop with the
    // content, which no longer matches the list's own row heights.
    await rotate({
      viewHeight: 700,
      rowHeight: PORTRAIT_ROW,
      browserScrollTop: 50 * ROW * (PORTRAIT_ROW / ROW),
    });
    expect(isAtTop(50)).toBe(true);
  });

  it('keeps the row that was at the top of the view after a rotation to portrait, when the browser keeps scrollTop', async () => {
    render(list(rows(200)));
    await settled();
    pageScroll(50 * ROW);
    await nextFrame();
    await rotate({viewHeight: 700, rowHeight: PORTRAIT_ROW});
    expect(isAtTop(50)).toBe(true);
  });

  it('keeps the row that was at the top of the view after a rotation back to landscape', async () => {
    render(list(rows(200)));
    await settled();
    pageScroll(50 * ROW);
    await nextFrame();
    await rotate({
      viewHeight: 700,
      rowHeight: PORTRAIT_ROW,
      browserScrollTop: 50 * PORTRAIT_ROW,
    });
    expect(isAtTop(50)).toBe(true);
    await rotate({
      viewHeight: 400,
      rowHeight: ROW,
      browserScrollTop: Math.round(el.scrollTop * (ROW / PORTRAIT_ROW)),
    });
    expect(isAtTop(50)).toBe(true);
  });

  it('keeps the row at the top when Safari writes its scroll position after the pass settles', async () => {
    render(list(rows(200)));
    await settled();
    pageScroll(50 * ROW);
    await nextFrame();
    await rotate({viewHeight: 700, rowHeight: PORTRAIT_ROW});
    expect(isAtTop(50)).toBe(true);
    // Safari's last scroll write of the rotation lands after the pass has
    // settled.
    await settled();
    pageScroll(el.scrollTop + 125);
    await nextFrame();
    await nextFrame();
    expect(isAtTop(50)).toBe(true);
  });

  it('keeps the row at the top when Safari scrolls before the resize event', async () => {
    render(list(rows(200)));
    await settled();
    pageScroll(50 * ROW);
    await nextFrame();
    // The viewport is already portrait when Safari's scroll event arrives,
    // and the resize event follows it.
    viewHeight = 700;
    rowHeight = PORTRAIT_ROW;
    pageScroll(50 * PORTRAIT_ROW + 300);
    await rotate({viewHeight: 700, rowHeight: PORTRAIT_ROW});
    expect(isAtTop(50)).toBe(true);
  });

  it('follows a wheel scroll right after a rotation', async () => {
    render(list(rows(200)));
    await settled();
    pageScroll(50 * ROW);
    await nextFrame();
    await rotate({viewHeight: 700, rowHeight: PORTRAIT_ROW});
    const before = topRow();
    act(() => {
      el.dispatchEvent(new Event('wheel'));
    });
    pageScroll(el.scrollTop + 10 * PORTRAIT_ROW);
    await nextFrame();
    await nextFrame();
    expect(topRow()).toBeGreaterThanOrEqual(before + 9);
  });

  it('keeps following the end through a rotation to landscape', async () => {
    const {rerender} = render(list(rows(60)));
    await settled();
    const atBottom = (): boolean =>
      Math.abs(el.scrollTop - (el.scrollHeight - el.clientHeight)) <= 1;
    expect(atBottom()).toBe(true);
    // Landscape: rows get shorter, and the browser scales scrollTop down.
    await rotate({
      viewHeight: 300,
      rowHeight: 70,
      browserScrollTop: Math.round(el.scrollTop * 0.7),
    });
    act(() => {
      rerender(list(rows(70)));
    });
    await settled();
    expect(atBottom()).toBe(true);
  });

  it('follows a keyboard scroll right after a rotation', async () => {
    render(list(rows(200)));
    await settled();
    pageScroll(50 * ROW);
    await nextFrame();
    await rotate({viewHeight: 700, rowHeight: PORTRAIT_ROW});
    const before = topRow();
    // PageDown on a control whose handler stops the key's propagation: the
    // browser still scrolls the page.
    const control = document.createElement('button');
    control.addEventListener('keydown', event => event.stopPropagation());
    document.body.append(control);
    act(() => {
      control.dispatchEvent(
        new KeyboardEvent('keydown', {key: 'PageDown', bubbles: true}),
      );
    });
    control.remove();
    pageScroll(el.scrollTop + 10 * PORTRAIT_ROW);
    await nextFrame();
    await nextFrame();
    expect(topRow()).toBeGreaterThanOrEqual(before + 9);
  });

  it('writes the scroll position at most once for a run of scroll events after a rotation', async () => {
    render(list(rows(200)));
    await settled();
    pageScroll(50 * ROW);
    await nextFrame();
    await rotate({viewHeight: 700, rowHeight: PORTRAIT_ROW});
    await settled();
    // A scripted smooth scroll right after the rotation, one step a frame.
    listWrites = 0;
    const start = el.scrollTop;
    for (let step = 1; step <= 8; step++) {
      pageScroll(start + step * 50);
      await nextFrame();
    }
    expect(listWrites).toBeLessThanOrEqual(1);
  });

  it('follows a scroll on its own scroller in the frame its height changes', async () => {
    // The list scrolls its own box, not the page.
    Object.defineProperty(document, 'scrollingElement', {
      configurable: true,
      get: () => document.documentElement,
    });
    render(list(rows(200)));
    await settled();
    act(() => {
      el.scrollTop = 50 * ROW;
      el.dispatchEvent(new Event('scroll'));
    });
    await nextFrame();
    await nextFrame();
    const before = topRow();
    // A growing composer shrinks the scroller; its observer entry has not
    // arrived yet when the reader's scroll does.
    viewHeight = 300;
    act(() => {
      el.scrollTop = el.scrollTop - 10 * ROW;
      el.dispatchEvent(new Event('scroll'));
    });
    await nextFrame();
    await nextFrame();
    expect(topRow()).toBeLessThanOrEqual(before - 9);
  });

  it('writes no scroll position during a rotation while a finger scrolls', async () => {
    render(list(rows(200)));
    await settled();
    finger('touchstart', true);
    pageScroll(5000);
    await rotate({viewHeight: 700, rowHeight: PORTRAIT_ROW});
    expect(el.scrollTop).toBe(5000);
    finger('touchend', false);
    act(() => {
      document.dispatchEvent(new Event('scrollend'));
    });
    await settled();
    expect(el.scrollTop).not.toBe(5000);
  });
});
