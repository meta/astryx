// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useScrollOverflow.test.tsx
 * @input Uses vitest, @testing-library/react, useScrollOverflow
 * @output Unit tests for the hook's measurement, its first one after layout,
 *   what it observes (the container's scroll and size, and its content), and
 *   its rendered-only gate
 * @position Testing; jsdom lays nothing out, so the scroll box is faked and
 *   `checkVisibility` is stubbed per element.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {useCallback} from 'react';
import {act, render, renderHook} from '@testing-library/react';
import {useScrollOverflow, useShownScrollOverflow} from './useScrollOverflow';
import {observeResize} from '../utils/sharedResizeObserver';

// jsdom has no ResizeObserver. This one hands the test the shared observer's
// callback so a resize can be delivered on demand. It sends no notification of
// its own: a test delivers the first one, as a browser does after layout.
let deliverResize: ((entries: ResizeObserverEntry[]) => void) | null = null;

class FakeResizeObserver implements ResizeObserver {
  /** The shared observer, so a test can read what it observes. */
  static last: FakeResizeObserver | null = null;
  constructor(callback: ResizeObserverCallback) {
    FakeResizeObserver.last = this;
    deliverResize = entries => callback(entries, this);
  }
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

// The shared observer reads only `target` off an entry.
function resizeEntry(target: Element): ResizeObserverEntry {
  return {target} as unknown as ResizeObserverEntry;
}

type Reads = {scrollWidth: number; clientWidth: number; scrollLeft: number};

// Fakes an overflowing scroll box and counts every layout read on it.
function fakeScrollBox(
  el: HTMLElement,
  box: {scrollWidth: number; clientWidth: number; scrollLeft?: number},
): Reads {
  const reads: Reads = {scrollWidth: 0, clientWidth: 0, scrollLeft: 0};
  const values: Reads = {scrollLeft: 0, ...box};
  for (const name of Object.keys(reads) as (keyof Reads)[]) {
    Object.defineProperty(el, name, {
      configurable: true,
      get() {
        reads[name] += 1;
        return values[name];
      },
    });
  }
  return reads;
}

function totalReads(reads: Reads): number {
  return reads.scrollWidth + reads.clientWidth + reads.scrollLeft;
}

function stubRendered(el: HTMLElement, rendered: boolean | undefined) {
  Object.defineProperty(el, 'checkVisibility', {
    configurable: true,
    value: rendered === undefined ? undefined : () => rendered,
  });
}

/**
 * The notification a browser sends after it lays `el` out. Its result
 * commits in a microtask, which the browser runs before it paints.
 */
async function layOut(el: HTMLElement) {
  await act(async () => {
    deliverResize?.([resizeEntry(el)]);
  });
}

// The classes a fade mask sets from the edges, as TabList's do.
const FADE_CLASSES = ['faded-end', 'faded-both'];

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  deliverResize = null;
  FakeResizeObserver.last = null;
});

describe('useScrollOverflow', () => {
  it('reads no layout or style when the ref attaches, and measures at the first resize notification', async () => {
    const el = document.createElement('div');
    el.append(document.createElement('div'), document.createElement('div'));
    const reads = fakeScrollBox(el, {scrollWidth: 600, clientWidth: 300});
    const checkVisibility = vi.fn(() => true);
    Object.defineProperty(el, 'checkVisibility', {
      configurable: true,
      value: checkVisibility,
    });
    const {result, unmount} = renderHook(() => useScrollOverflow());

    // The ref attaches in React's commit.
    act(() => {
      result.current.scrollRef(el);
    });
    expect(checkVisibility).not.toHaveBeenCalled();
    expect(totalReads(reads)).toBe(0);
    expect(result.current.hasOverflow).toBe(false);

    // The browser lays the container out, then notifies: the read happens
    // there.
    await layOut(el);
    expect(result.current.hasOverflow).toBe(true);
    expect(result.current.overflowStart).toBe(false);
    expect(result.current.overflowEnd).toBe(true);
    expect(totalReads(reads)).toBeGreaterThan(0);
    unmount();
  });

  it('measures and commits in a microtask after the first delivery: before the frame paints, at the offset that delivery leaves', async () => {
    const el = document.createElement('div');
    const child = document.createElement('div');
    el.append(child);
    const reads = fakeScrollBox(el, {scrollWidth: 600, clientWidth: 300});
    stubRendered(el, true);
    const {result, unmount} = renderHook(() => useScrollOverflow());
    act(() => {
      result.current.scrollRef(el);
    });

    let readsInDelivery = -1;
    let afterMicrotask: unknown = null;
    await act(async () => {
      // One delivery reports the container and its child.
      deliverResize?.([resizeEntry(el), resizeEntry(child)]);
      readsInDelivery = totalReads(reads);
      // A later callback of the same delivery scrolls the container, as
      // TabList's reveal of its selected tab does.
      fakeScrollBox(el, {scrollWidth: 600, clientWidth: 300, scrollLeft: 300});
      await Promise.resolve();
      // No frame and no timer has run: only the microtask.
      afterMicrotask = {
        start: result.current.overflowStart,
        end: result.current.overflowEnd,
      };
    });

    expect(readsInDelivery).toBe(0);
    // The edges of the scrolled offset, committed before the frame paints.
    expect(afterMicrotask).toEqual({start: true, end: false});
    unmount();
  });

  it('measures nothing after it detaches before that microtask', async () => {
    const el = document.createElement('div');
    const reads = fakeScrollBox(el, {scrollWidth: 600, clientWidth: 300});
    stubRendered(el, true);
    const {result, unmount} = renderHook(() => useScrollOverflow());
    act(() => {
      result.current.scrollRef(el);
    });

    await act(async () => {
      deliverResize?.([resizeEntry(el)]);
      result.current.scrollRef(null);
    });

    expect(totalReads(reads)).toBe(0);
    expect(result.current.hasOverflow).toBe(false);
    unmount();
  });

  it('reads nothing for a child that another observer already watches', async () => {
    const el = document.createElement('div');
    const child = document.createElement('div');
    el.append(child);
    const reads = fakeScrollBox(el, {scrollWidth: 600, clientWidth: 300});
    stubRendered(el, true);
    // An element that is already observed gets no first notification.
    const stopWatching = observeResize(child, () => {});
    const {result, unmount} = renderHook(() => useScrollOverflow());

    await act(async () => {
      result.current.scrollRef(el);
    });
    expect(totalReads(reads)).toBe(0);

    await layOut(el);
    expect(result.current.hasOverflow).toBe(true);
    unmount();
    stopWatching();
  });

  it('measures at once where no ResizeObserver exists', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const el = document.createElement('div');
    el.append(document.createElement('div'));
    fakeScrollBox(el, {scrollWidth: 600, clientWidth: 300});
    stubRendered(el, true);
    const {result, unmount} = renderHook(() => useScrollOverflow());

    act(() => {
      result.current.scrollRef(el);
    });

    expect(result.current.hasOverflow).toBe(true);
    expect(result.current.overflowEnd).toBe(true);
    unmount();
  });

  it('reads no layout while the container is not rendered', () => {
    const el = document.createElement('div');
    const reads = fakeScrollBox(el, {scrollWidth: 600, clientWidth: 300});
    stubRendered(el, false);
    const {result, unmount} = renderHook(() => useScrollOverflow());

    act(() => {
      result.current.scrollRef(el);
    });
    // A resize delivered for the hidden box (a `display: none` or a
    // `content-visibility: hidden` ancestor reports a zero box) is skipped
    // too; a scroll is not (the next case).
    act(() => {
      deliverResize?.([resizeEntry(el)]);
    });

    expect(totalReads(reads)).toBe(0);
    expect(result.current.hasOverflow).toBe(false);
    expect(result.current.overflowEnd).toBe(false);
    unmount();
  });

  it('keeps the last state while hidden and measures again on the reveal', async () => {
    const el = document.createElement('div');
    const reads = fakeScrollBox(el, {
      scrollWidth: 600,
      clientWidth: 300,
      scrollLeft: 150,
    });
    stubRendered(el, true);
    const {result, unmount} = renderHook(() => useScrollOverflow());

    act(() => {
      result.current.scrollRef(el);
    });
    await layOut(el);
    expect(result.current.overflowStart).toBe(true);
    expect(result.current.overflowEnd).toBe(true);

    stubRendered(el, false);
    const readsBeforeHide = totalReads(reads);
    act(() => {
      deliverResize?.([resizeEntry(el)]);
    });
    expect(totalReads(reads)).toBe(readsBeforeHide);
    expect(result.current.overflowStart).toBe(true);
    expect(result.current.overflowEnd).toBe(true);

    // Revealed at the end edge with a new size: the resize that follows the
    // reveal measures (a reveal at the same size has no resize, and relies on
    // the scroll having been measured: the next case).
    stubRendered(el, true);
    fakeScrollBox(el, {scrollWidth: 600, clientWidth: 300, scrollLeft: 300});
    act(() => {
      deliverResize?.([resizeEntry(el)]);
    });
    expect(result.current.overflowStart).toBe(true);
    expect(result.current.overflowEnd).toBe(false);
    unmount();
  });

  it('measures a scroll while hidden, so a reveal at the same size is already right', async () => {
    const el = document.createElement('div');
    fakeScrollBox(el, {scrollWidth: 600, clientWidth: 300});
    stubRendered(el, true);
    const {result, unmount} = renderHook(() => useScrollOverflow());

    act(() => {
      result.current.scrollRef(el);
    });
    await layOut(el);
    expect(result.current.overflowStart).toBe(false);
    expect(result.current.overflowEnd).toBe(true);

    // Hidden, then scrolled by script to the end edge (a selected tab's
    // reveal under a hidden panel): the scroll is measured.
    stubRendered(el, false);
    const scrolled = fakeScrollBox(el, {
      scrollWidth: 600,
      clientWidth: 300,
      scrollLeft: 300,
    });
    act(() => {
      el.dispatchEvent(new Event('scroll'));
    });
    expect(totalReads(scrolled)).toBeGreaterThan(0);
    expect(result.current.overflowStart).toBe(true);
    expect(result.current.overflowEnd).toBe(false);

    // Revealed at the same size: no resize observation comes, and none is
    // needed.
    stubRendered(el, true);
    expect(result.current.overflowStart).toBe(true);
    expect(result.current.overflowEnd).toBe(false);
    unmount();
  });

  it('measures in a browser without checkVisibility', async () => {
    const el = document.createElement('div');
    const reads = fakeScrollBox(el, {scrollWidth: 600, clientWidth: 300});
    stubRendered(el, undefined);
    const {result, unmount} = renderHook(() => useScrollOverflow());

    act(() => {
      result.current.scrollRef(el);
    });
    await layOut(el);

    expect(result.current.hasOverflow).toBe(true);
    expect(totalReads(reads)).toBeGreaterThan(0);
    unmount();
  });

  // The overflow is the content's width against the container's: it changes
  // when the content does, with the container keeping its size.
  it('measures again when a child is added or removed, though the container keeps its size', async () => {
    const el = document.createElement('div');
    fakeScrollBox(el, {scrollWidth: 300, clientWidth: 300});
    stubRendered(el, true);
    const {result, unmount} = renderHook(() => useScrollOverflow());
    act(() => {
      result.current.scrollRef(el);
    });
    expect(result.current.hasOverflow).toBe(false);

    const child = document.createElement('div');
    fakeScrollBox(el, {scrollWidth: 600, clientWidth: 300});
    await act(async () => {
      el.append(child);
    });
    expect(result.current.hasOverflow).toBe(true);

    fakeScrollBox(el, {scrollWidth: 300, clientWidth: 300});
    await act(async () => {
      child.remove();
    });
    expect(result.current.hasOverflow).toBe(false);
    unmount();
  });

  it('measures again when a child resizes, though the container keeps its size', () => {
    const el = document.createElement('div');
    const child = document.createElement('div');
    el.append(child);
    fakeScrollBox(el, {scrollWidth: 300, clientWidth: 300});
    stubRendered(el, true);
    const {result, unmount} = renderHook(() => useScrollOverflow());
    act(() => {
      result.current.scrollRef(el);
    });
    expect(result.current.hasOverflow).toBe(false);

    // The child's content grows past the container.
    fakeScrollBox(el, {scrollWidth: 600, clientWidth: 300});
    act(() => {
      deliverResize?.([resizeEntry(child)]);
    });
    expect(result.current.hasOverflow).toBe(true);
    unmount();
  });

  it("measures again when the container's class or style changes, as a new gap does", async () => {
    const el = document.createElement('div');
    fakeScrollBox(el, {scrollWidth: 300, clientWidth: 300});
    stubRendered(el, true);
    const {result, unmount} = renderHook(() => useScrollOverflow());
    act(() => {
      result.current.scrollRef(el);
    });
    expect(result.current.hasOverflow).toBe(false);

    fakeScrollBox(el, {scrollWidth: 340, clientWidth: 300});
    await act(async () => {
      el.className = 'wider-gap';
    });
    expect(result.current.hasOverflow).toBe(true);

    fakeScrollBox(el, {scrollWidth: 300, clientWidth: 300});
    await act(async () => {
      el.style.columnGap = '0px';
    });
    expect(result.current.hasOverflow).toBe(false);
    unmount();
  });

  it('does not measure again for a class its own edges put on the container', async () => {
    // A fade mask is a class chosen from the edges, as TabList sets it. That
    // write follows the measurement that chose it and changes no layout. A
    // strip whose class never changes is the baseline for the same mount.
    async function readsAfterSettling(isFaded: boolean): Promise<number> {
      let reads: Reads | null = null;
      let strip: HTMLDivElement | null = null;
      function Strip() {
        const {scrollRef, overflowEnd} = useShownScrollOverflow({
          ownClassNames: FADE_CLASSES,
        });
        // One callback for the strip's life, as TabList keeps: a new ref
        // each render would reattach the observation around the class write.
        const ref = useCallback(
          (el: HTMLDivElement | null) => {
            if (el != null && reads == null) {
              reads = fakeScrollBox(el, {scrollWidth: 600, clientWidth: 300});
              stubRendered(el, true);
              strip = el;
            }
            scrollRef(el);
          },
          [scrollRef],
        );
        return (
          <div
            className={isFaded && overflowEnd ? 'faded-end' : undefined}
            ref={ref}
          />
        );
      }
      const {container, unmount} = render(<Strip />);
      await layOut(strip as unknown as HTMLElement);
      await act(async () => {});
      expect(container.firstElementChild?.classList.contains('faded-end')).toBe(
        isFaded,
      );
      const total = totalReads(reads as unknown as Reads);
      unmount();
      return total;
    }

    const baseline = await readsAfterSettling(false);
    expect(await readsAfterSettling(true)).toBe(baseline);
  });

  it("still measures an app's own class change made in the same commit as an edge change", async () => {
    // The commit that sets the end edge also sets the app's own class, and
    // that class moves the scroll offset. Only the fade's classes are the
    // hook's own, so the app's class write is measured and the start edge
    // follows.
    let overflowStart = false;
    let strip: HTMLDivElement | null = null;
    function Strip() {
      const shown = useShownScrollOverflow({ownClassNames: FADE_CLASSES});
      const {scrollRef} = shown;
      overflowStart = shown.overflowStart;
      const ref = useCallback(
        (el: HTMLDivElement | null) => {
          if (el != null) {
            fakeScrollBox(el, {scrollWidth: 600, clientWidth: 300});
            Object.defineProperty(el, 'scrollLeft', {
              configurable: true,
              get: () => (el.classList.contains('app-scrolled') ? 10 : 0),
            });
            stubRendered(el, true);
            strip = el;
          }
          scrollRef(el);
        },
        [scrollRef],
      );
      return (
        <div
          className={shown.overflowEnd ? 'faded-end app-scrolled' : undefined}
          ref={ref}
        />
      );
    }
    const {unmount} = render(<Strip />);
    await layOut(strip as unknown as HTMLElement);
    await act(async () => {});
    expect(overflowStart).toBe(true);
    unmount();
  });

  it('stops observing the content when the container detaches', () => {
    const el = document.createElement('div');
    const child = document.createElement('div');
    el.append(child);
    fakeScrollBox(el, {scrollWidth: 300, clientWidth: 300});
    stubRendered(el, true);
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');
    const {result, unmount} = renderHook(() => useScrollOverflow());
    act(() => {
      result.current.scrollRef(el);
    });
    const observer = FakeResizeObserver.last;
    expect(observer?.observe).toHaveBeenCalledWith(child);

    act(() => {
      result.current.scrollRef(null);
    });
    expect(disconnect).toHaveBeenCalled();
    expect(observer?.unobserve).toHaveBeenCalledWith(child);
    expect(observer?.unobserve).toHaveBeenCalledWith(el);
    unmount();
  });

  it('follows a scroll on a rendered container', () => {
    const el = document.createElement('div');
    fakeScrollBox(el, {scrollWidth: 600, clientWidth: 300});
    stubRendered(el, true);
    const {result, unmount} = renderHook(() => useScrollOverflow());

    act(() => {
      result.current.scrollRef(el);
    });
    expect(result.current.overflowStart).toBe(false);

    fakeScrollBox(el, {scrollWidth: 600, clientWidth: 300, scrollLeft: 300});
    act(() => {
      el.dispatchEvent(new Event('scroll'));
    });
    expect(result.current.overflowStart).toBe(true);
    expect(result.current.overflowEnd).toBe(false);
    unmount();
  });

  it('returns the same fields as before, with no way to report a position', () => {
    const {result, unmount} = renderHook(() => useScrollOverflow());
    expect(Object.keys(result.current).sort()).toEqual([
      'hasOverflow',
      'overflowEnd',
      'overflowStart',
      'scrollRef',
    ]);
    unmount();
  });
});

describe('useShownScrollOverflow', () => {
  async function attach() {
    const el = document.createElement('div');
    fakeScrollBox(el, {scrollWidth: 600, clientWidth: 300});
    stubRendered(el, true);
    const hook = renderHook(() => useShownScrollOverflow());
    act(() => {
      hook.result.current.scrollRef(el);
    });
    await layOut(el);
    return {el, ...hook};
  }

  const nextFrame = async () =>
    act(
      async () =>
        new Promise<void>(resolve => {
          requestAnimationFrame(() => resolve());
        }),
    );

  it('measures the edges from a reported position while the scroll offset stays put', async () => {
    const {result, unmount} = await attach();
    expect([result.current.overflowStart, result.current.overflowEnd]).toEqual([
      false,
      true,
    ]);
    act(() => result.current.followShown({offset: 150, travel: 300}));
    expect([result.current.overflowStart, result.current.overflowEnd]).toEqual([
      true,
      true,
    ]);
    act(() => result.current.followShown({offset: 299.5, travel: 300}));
    expect([result.current.overflowStart, result.current.overflowEnd]).toEqual([
      true,
      false,
    ]);
    unmount();
  });

  it('marks the edges that the first measurement set, and no later edges', async () => {
    const {result, unmount} = await attach();
    expect(result.current.overflowEnd).toBe(true);
    expect(result.current.isFirstMeasurement).toBe(true);
    act(() => result.current.followShown({offset: 150, travel: 300}));
    expect(result.current.overflowStart).toBe(true);
    expect(result.current.isFirstMeasurement).toBe(false);
    unmount();
  });

  it('commits an edge change in the report itself, so a held row changes the buttons in its frame', async () => {
    const {result, unmount} = await attach();
    act(() => {
      result.current.followShown({offset: 150, travel: 300});
      // Rendered before the report returns, not when the batch ends.
      expect(result.current.overflowStart).toBe(true);
    });
    unmount();
  });

  it('renders nothing for a report that changes no edge', () => {
    let renders = 0;
    const el = document.createElement('div');
    fakeScrollBox(el, {scrollWidth: 600, clientWidth: 300});
    stubRendered(el, true);
    const {result, unmount} = renderHook(() => {
      renders += 1;
      return useShownScrollOverflow();
    });
    act(() => {
      result.current.scrollRef(el);
    });
    act(() => result.current.followShown({offset: 150, travel: 300}));
    const before = renders;
    act(() => result.current.followShown({offset: 160, travel: 300}));
    act(() => result.current.followShown({offset: 170, travel: 300}));
    expect(renders).toBe(before);
    unmount();
  });

  it('keeps the reported edges for one frame after null, then measures the scroll offset', async () => {
    const {el, result, unmount} = await attach();
    act(() => result.current.followShown({offset: 300, travel: 300}));
    act(() => result.current.followShown(null));
    expect(result.current.overflowEnd).toBe(false);
    // A scroll before that frame still reads the reported position.
    act(() => {
      el.dispatchEvent(new Event('scroll'));
    });
    expect(result.current.overflowEnd).toBe(false);
    await nextFrame();
    expect(result.current.overflowEnd).toBe(true);
    unmount();
  });

  it('leaves no frame running when the container detaches or the hook unmounts', async () => {
    const cancel = vi.spyOn(window, 'cancelAnimationFrame');
    const {result, unmount} = await attach();
    act(() => result.current.followShown({offset: 300, travel: 300}));
    act(() => result.current.followShown(null));
    const calls = cancel.mock.calls.length;
    act(() => result.current.scrollRef(null));
    expect(cancel.mock.calls.length).toBeGreaterThan(calls);
    // With no container, null schedules nothing.
    const request = vi.spyOn(window, 'requestAnimationFrame');
    act(() => result.current.followShown({offset: 300, travel: 300}));
    act(() => result.current.followShown(null));
    expect(request).not.toHaveBeenCalled();
    unmount();
  });
});
