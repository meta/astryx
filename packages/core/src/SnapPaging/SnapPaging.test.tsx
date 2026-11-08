// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SnapPaging.test.tsx
 * @input vitest (jsdom), Testing Library, SnapPaging, Carousel
 * @output Proves the hook in Carousel. It claims the row's pans under every
 *   pointer, and dropping the value or unmounting removes every listener it
 *   added. Its entry has no `create…` equivalent. The value is stable, and
 *   Carousel attaches it once and snaps as `hasSnap` does
 * @position Testing; the paging motion itself is in the browser proofs
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createRef} from 'react';
import {act, render, renderHook, screen} from '@testing-library/react';
import {Carousel, type CarouselHandle} from '../Carousel/Carousel';
import {useSnapPaging} from './SnapPaging';
import {
  type HeldRow,
  type HeldRowListener,
  isSnapPaging,
  makeSnapPaging,
  nearestStop,
  type SnapPagingAttachment,
  snapPages,
  snapStops,
} from './snapPagingValue';

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

/** The primary pointer each case runs under, read live by every list. */
const pointer = {coarse: false};
const listeners = new Set<() => void>();

beforeEach(() => {
  pointer.coarse = false;
  listeners.clear();
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      get matches() {
        return query.includes('pointer: coarse') ? pointer.coarse : false;
      },
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: (_type: string, listener: () => void) =>
        listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) =>
        listeners.delete(listener),
      dispatchEvent: vi.fn(),
    })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

const attachment = (detach = () => {}): SnapPagingAttachment => ({
  detach,
  move: () => {},
  moveHeld: () => false,
});

/** The touch-action the gesture host derived for `element`, '' for none. */
const touchAction = (element: HTMLElement) =>
  element.getAttribute('data-astryx-touch-action') ?? '';

describe('useSnapPaging', () => {
  it('returns one value for the component\u2019s life, which only Carousel reads', () => {
    const {result, rerender} = renderHook(
      ({pages}: {pages: 'view' | 'item'}) => useSnapPaging({pages}),
      {initialProps: {pages: 'view'}},
    );
    const first = result.current;
    expect(isSnapPaging(first)).toBe(true);
    rerender({pages: 'item'});
    expect(result.current).toBe(first);
    expect(isSnapPaging({})).toBe(false);
  });

  it('is the entry\u2019s only export: no create\u2026 equivalent feeds anything else', async () => {
    const entry = await import('./index');
    expect(Object.keys(entry)).toEqual(['useSnapPaging']);
  });
});

// A disabled Button stays focusable: it sets `aria-disabled`, not the native
// `disabled` property.
const isDisabled = (button: HTMLElement) =>
  button.getAttribute('aria-disabled') === 'true';

describe('Carousel with hasSnap', () => {
  function scroller() {
    return screen
      .getByRole('region', {name: 'Items'})
      .querySelector('[role="group"]') as HTMLElement;
  }

  it('hands its scroll area to the hook\u2019s value under every pointer, a fine one included', () => {
    function Paging() {
      return (
        <Carousel aria-label="Items" hasSnap={useSnapPaging()}>
          <div>One</div>
          <div>Two</div>
        </Carousel>
      );
    }
    const {unmount} = render(<Paging />);
    expect(touchAction(scroller())).toBe('pan-y pinch-zoom');
    unmount();
  });

  it('removes every listener it added to the scroll area when Carousel drops the value or unmounts', () => {
    // Every listener added to or removed from any target, in order.
    const log: {
      isAdd: boolean;
      target: EventTarget;
      type: string;
      listener: unknown;
    }[] = [];
    const realAdd = EventTarget.prototype.addEventListener;
    const realRemove = EventTarget.prototype.removeEventListener;
    const add = vi
      .spyOn(EventTarget.prototype, 'addEventListener')
      .mockImplementation(function (this: EventTarget, type, listener, opts) {
        log.push({isAdd: true, target: this, type, listener});
        realAdd.call(this, type, listener, opts);
      });
    const remove = vi
      .spyOn(EventTarget.prototype, 'removeEventListener')
      .mockImplementation(function (this: EventTarget, type, listener, opts) {
        log.push({isAdd: false, target: this, type, listener});
        realRemove.call(this, type, listener, opts);
      });
    try {
      function Toggle({isPaging}: {isPaging: boolean}) {
        const paging = useSnapPaging();
        return (
          <Carousel aria-label="Items" hasSnap={isPaging ? paging : true}>
            <div>One</div>
            <div>Two</div>
          </Carousel>
        );
      }
      const {rerender, unmount} = render(<Toggle isPaging={false} />);
      const element = scroller();
      // The listeners added to the scroll area since `since` and still on it.
      const live = (since: number) => {
        const ids = new Map<unknown, number>();
        const keyOf = (type: string, listener: unknown) => {
          if (!ids.has(listener)) {
            ids.set(listener, ids.size);
          }
          return `${type}|${ids.get(listener)}`;
        };
        const keys = new Set<string>();
        for (const entry of log.slice(since)) {
          if (entry.target !== element) {
            continue;
          }
          const key = keyOf(entry.type, entry.listener);
          if (entry.isAdd) {
            keys.add(key);
          } else {
            keys.delete(key);
          }
        }
        return [...keys];
      };
      let since = log.length;
      rerender(<Toggle isPaging />);
      expect(touchAction(element)).toBe('pan-y pinch-zoom');
      expect(live(since).length).toBeGreaterThan(0);
      rerender(<Toggle isPaging={false} />);
      expect(touchAction(element)).toBe('');
      expect(live(since)).toEqual([]);
      since = log.length;
      rerender(<Toggle isPaging />);
      expect(live(since).length).toBeGreaterThan(0);
      act(() => unmount());
      expect(live(since)).toEqual([]);
    } finally {
      add.mockRestore();
      remove.mockRestore();
    }
  });

  it('runs no gesture code with hasSnap alone', () => {
    pointer.coarse = true;
    render(
      <Carousel aria-label="Items" hasSnap>
        <div>One</div>
        <div>Two</div>
      </Carousel>,
    );
    expect(touchAction(scroller())).toBe('');
  });

  it('snaps alike with hasSnap and with a paging value, and not without either', () => {
    const value = makeSnapPaging(() => attachment());
    const classes = (hasSnap?: boolean | typeof value) => {
      const {unmount} = render(
        <Carousel aria-label="Items" hasSnap={hasSnap}>
          <div>One</div>
        </Carousel>,
      );
      const className = scroller().className;
      unmount();
      return className;
    };
    const snapped = classes(true);
    expect(classes(value)).toBe(snapped);
    expect(classes(false)).not.toBe(snapped);
    expect(classes(undefined)).toBe(classes(false));
  });

  it('nearestStop picks the nearest stop, and keeps the offset with no items', () => {
    expect(nearestStop([0, 103, 205], 120)).toBe(103);
    expect(nearestStop([], 42)).toBe(42);
  });

  describe('the end page', () => {
    // A row 299 px wide holds seven items 94.67 px wide and 8 px apart. The
    // fifth item's stop, 410.67, sits 1.33 px before the row's end.
    function row() {
      const element = document.createElement('div');
      const box = {left: 0, right: 299, width: 299} as DOMRect;
      element.getBoundingClientRect = () => box;
      for (let i = 0; i < 7; i++) {
        const item = document.createElement('div');
        const left = i * (94.67 + 8);
        item.getBoundingClientRect = () =>
          ({left, right: left + 94.67, width: 94.67}) as DOMRect;
        element.append(item);
      }
      document.body.append(element);
      return element;
    }
    const rounded = (stops: number[]) => stops.map(stop => Math.round(stop));

    it('a stop within half its preceding step of the end is the end page, which rests where the row ends', () => {
      expect(rounded(snapStops(row(), 0, 412))).toEqual([
        0, 103, 205, 308, 412,
      ]);
    });

    it('native snap skips that stop until the stop is further from the end than half its step', () => {
      const element = row();
      expect(snapPages(element, 0, 412).skipped).toEqual([element.children[4]]);
      const split = snapPages(element, 0, 471);
      expect(rounded(split.stops)).toEqual([0, 103, 205, 308, 411, 471]);
      expect(split.skipped).toEqual([]);
    });
  });

  it('attaches once: a new paging value on a later render attaches nothing again', () => {
    const attached: string[] = [];
    const first = makeSnapPaging(() => {
      attached.push('first');
      return attachment(() => attached.push('first detached'));
    });
    const second = makeSnapPaging(() => {
      attached.push('second');
      return attachment(() => attached.push('second detached'));
    });
    const {rerender, unmount} = render(
      <Carousel aria-label="Items" hasSnap={first}>
        <div>One</div>
      </Carousel>,
    );
    rerender(
      <Carousel aria-label="Items" hasSnap={second}>
        <div>One</div>
      </Carousel>,
    );
    expect(attached).toEqual(['first']);
    act(() => unmount());
    expect(attached).toEqual(['first', 'first detached']);
  });

  describe('a scroll call under snap paging', () => {
    // A paging value that records each move it is asked for.
    function renderMoves() {
      const moves: ((at: number, end: number) => number)[] = [];
      const value = makeSnapPaging(() => ({
        ...attachment(),
        move: target => {
          moves.push(target);
        },
      }));
      const handle = createRef<CarouselHandle>();
      render(
        <Carousel aria-label="Items" hasSnap={value} handleRef={handle}>
          <div>One</div>
          <div>Two</div>
          <div>Three</div>
        </Carousel>,
      );
      const row = scroller();
      const scrollTo = vi.fn();
      const scrollBy = vi.fn();
      row.scrollTo = scrollTo;
      row.scrollBy = scrollBy;
      return {moves, handle, scrollTo, scrollBy};
    }

    it('moves the row at rest through the paging, not with a native smooth scroll', () => {
      const {moves, handle, scrollTo, scrollBy} = renderMoves();
      act(() => handle.current?.scrollNext());
      act(() => handle.current?.scrollPrev());
      expect(moves).toHaveLength(2);
      expect(scrollTo).not.toHaveBeenCalled();
      expect(scrollBy).not.toHaveBeenCalled();
    });

    it('moves the row through the paging for a scroll to an item', () => {
      const {moves, handle, scrollTo, scrollBy} = renderMoves();
      act(() => handle.current?.scrollTo(2));
      expect(moves).toHaveLength(1);
      expect(scrollTo).not.toHaveBeenCalled();
      expect(scrollBy).not.toHaveBeenCalled();
    });

    it('moves a scroll to an item onto its snap stop, inside the scroll padding', () => {
      const {moves, handle} = renderMoves();
      const row = scroller();
      // Three 100 px items in a 300 px row with 16 px of scroll padding.
      row.style.setProperty('scroll-padding-left', '16px');
      row.getBoundingClientRect = () => new DOMRect(0, 0, 300, 100);
      Array.from(row.children).forEach((child, i) => {
        child.getBoundingClientRect = () => new DOMRect(i * 100, 0, 100, 100);
      });
      act(() => handle.current?.scrollTo(2));
      // The stop is the item's start less the padding, not its border edge.
      expect(moves[0](0, 500)).toBe(184);
    });
  });

  describe('the edge buttons follow a held row as shown', () => {
    // A paging value that reports a held row on demand, as the pager does on
    // each frame of a hold.
    function renderHeld() {
      let listener: HeldRowListener | undefined;
      const value = makeSnapPaging((_element, onHeld) => {
        listener = onHeld;
        return attachment();
      });
      render(
        <Carousel aria-label="Items" hasSnap={value}>
          <div>One</div>
          <div>Two</div>
          <div>Three</div>
        </Carousel>,
      );
      const button = (name: string) =>
        screen.getByRole<HTMLButtonElement>('button', {name, hidden: true});
      return {
        report: (held: HeldRow | null) => act(() => listener?.(held)),
        start: button('Scroll left'),
        end: button('Scroll right'),
      };
    }

    it('enables and disables each button as the held row leaves or reaches its edge, before the hand-back', () => {
      const {report, start, end} = renderHeld();
      // jsdom lays nothing out, so at rest the scroll offset gives no room.
      expect([isDisabled(start), isDisabled(end)]).toEqual([true, true]);
      report({offset: 0, travel: 600});
      expect([isDisabled(start), isDisabled(end)]).toEqual([true, false]);
      report({offset: 300, travel: 600});
      expect([isDisabled(start), isDisabled(end)]).toEqual([false, false]);
      report({offset: 599.5, travel: 600});
      expect([isDisabled(start), isDisabled(end)]).toEqual([false, true]);
    });

    it('keeps the held edges for one frame after the hand-back, then reads the scroll offset again', async () => {
      const {report, start} = renderHeld();
      report({offset: 300, travel: 600});
      report({offset: 300, travel: 600});
      report(null);
      expect(isDisabled(start)).toBe(false);
      await act(
        async () =>
          new Promise<void>(resolve => {
            requestAnimationFrame(() => resolve());
          }),
      );
      expect(isDisabled(start)).toBe(true);
    });

    it('hands focus to the scroll area once, when the held row reaches the edge of the focused button', () => {
      const {report, end} = renderHeld();
      report({offset: 300, travel: 600});
      act(() => end.focus());
      const focus = vi.spyOn(scroller(), 'focus');
      report({offset: 600, travel: 600});
      expect(focus).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(scroller());
      report({offset: 600, travel: 600});
      expect(focus).toHaveBeenCalledTimes(1);
    });
  });
});
