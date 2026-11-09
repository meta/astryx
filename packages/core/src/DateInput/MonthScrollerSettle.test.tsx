// Copyright (c) Meta Platforms, Inc. and affiliates.

import {act, render} from '@testing-library/react';
import {createRef} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {MonthScroller, type MonthScrollerHandle} from './MonthScroller';
import {SCROLL_QUIET_MS} from './useScrollSettle';
import {createMonthModel} from './monthGeometry';
import type {PlainDate} from '../utils/dateTypes';

class FakeResizeObserver {
  constructor(private callback: ResizeObserverCallback) {}
  observe() {
    this.callback([], this);
  }
  unobserve() {}
  disconnect() {}
}

const PANE = 300;

/**
 * The month scroller's settle, with the browser's scrolling played by hand:
 * `scrollTo` is recorded, and the offset is whatever the test sets.
 */
describe('MonthScroller settle', () => {
  const scrollTo = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'Date',
        'performance',
      ],
    });
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(PANE);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(
      PANE,
    );
    Element.prototype.scrollTo = scrollTo;
    scrollTo.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function renderScroller(onVisibleMonthChange = () => {}) {
    const handleRef = createRef<MonthScrollerHandle>();
    const scrollerFor = (selectedDate: PlainDate | null) => (
      <MonthScroller
        monthModel={createMonthModel('gregory')}
        handleRef={handleRef}
        minMonthIndex={0}
        maxMonthIndex={23}
        initialMonthIndex={9}
        onVisibleMonthChange={onVisibleMonthChange}
        selectedDate={selectedDate}
        today={{year: 2026, month: 10, day: 15}}
        isDateDisabled={() => false}
        weekStartsOn={0}
        onSelect={() => {}}
      />
    );
    const view = render(scrollerFor(null));
    const scroller = view.container.querySelector<HTMLElement>(
      '[data-scroller="months"]',
    );
    if (scroller == null) {
      throw new Error('no month scroller');
    }
    scrollTo.mockClear();
    /** The owner renders the scroller again with a new selection. */
    const select = (date: PlainDate) => {
      view.rerender(scrollerFor(date));
    };
    return {handleRef, scroller, select};
  }

  /** The browser moving the scroller to `left`, as a scroll event reports. */
  /**
   * A touch event carrying the lists a real one always has: jsdom has no
   * constructible TouchEvent, and the gesture hook reads `touches[0]`.
   */
  function touchEvent(type: 'touchstart' | 'touchend') {
    const event = new Event(type, {bubbles: true});
    const point = {identifier: 1, clientX: 100, clientY: 100};
    Object.defineProperties(event, {
      touches: {value: type === 'touchend' ? [] : [point]},
      targetTouches: {value: type === 'touchend' ? [] : [point]},
      changedTouches: {value: [point]},
    });
    return event;
  }

  function scrollBy(scroller: HTMLElement, left: number) {
    scroller.scrollLeft = left;
    scroller.dispatchEvent(new Event('scroll'));
  }

  it('turns scroll snapping back on after re-centers that end on the month they began on', () => {
    const {handleRef, scroller} = renderScroller();
    // Two far jumps in one batch, out and back: each re-centers the mounted
    // months, pausing scroll snapping, and the second puts the center back
    // where it was, so the render that follows changes no center.
    act(() => {
      handleRef.current?.scrollToMonth(20);
      handleRef.current?.scrollToMonth(9);
    });
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(scroller.style.scrollSnapType).toBe('');
  });

  it('leaves snapping on for a re-center while a finger drives the scroll', () => {
    const {scroller} = renderScroller();
    // A finger drags the next month in: the scroller crosses the middle of
    // October's pane and re-centers its months with the finger still down.
    act(() => {
      scroller.dispatchEvent(touchEvent('touchstart'));
    });
    act(() => scrollBy(scroller, 9 * PANE + 0.6 * PANE));
    act(() => {
      vi.advanceTimersByTime(16);
    });
    // Snapping stays on: iOS tracks a snap target for the gesture.
    expect(scroller.style.scrollSnapType).toBe('');
  });

  it('pauses snapping for a re-center again once the finger’s scroll has come to rest', () => {
    const {handleRef, scroller} = renderScroller();
    act(() => {
      scroller.dispatchEvent(touchEvent('touchstart'));
      scroller.dispatchEvent(touchEvent('touchend'));
    });
    act(() => {
      vi.advanceTimersByTime(SCROLL_QUIET_MS + 50);
    });
    // An arrow's far jump after the swipe re-centers with snapping paused.
    act(() => handleRef.current?.scrollToMonth(20));
    expect(scroller.style.scrollSnapType).toBe('none');
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(scroller.style.scrollSnapType).toBe('');
  });

  it('finishes a steer the browser cut short instead of rounding it back', () => {
    const {handleRef, scroller} = renderScroller();
    // An arrow toward month 10, its scroll 95 % of the way there.
    act(() => handleRef.current?.scrollToMonth(10));
    act(() => scrollBy(scroller, 9 * PANE + 0.95 * PANE));
    // The other arrow, late in that scroll: back toward month 9.
    act(() => handleRef.current?.scrollToMonth(9));
    scrollTo.mockClear();
    // WebKit ends the retargeted scroll where the first one's time ran out,
    // near month 10, and the scroller goes quiet there.
    act(() => scrollBy(scroller, 9 * PANE + 0.95 * PANE));
    act(() => {
      vi.advanceTimersByTime(SCROLL_QUIET_MS + 50);
    });
    // The settle finishes the steer onto month 9, not the nearest pane (10).
    expect(
      scrollTo.mock.calls.map(([options]) => (options as ScrollToOptions).left),
    ).toEqual([9 * PANE]);
  });

  it('rests a step that arrives on scrollend once: no correction and no report, and a scroll after it reports', () => {
    const onVisibleMonthChange = vi.fn();
    const {handleRef, scroller} = renderScroller(onVisibleMonthChange);
    act(() => handleRef.current?.scrollToMonth(10));
    scrollTo.mockClear();
    // The step's scroll arrives on month 10, and the browser ends it.
    act(() => scrollBy(scroller, 10 * PANE));
    act(() => {
      vi.advanceTimersByTime(16);
      scroller.dispatchEvent(new Event('scrollend'));
      vi.advanceTimersByTime(16);
    });
    act(() => {
      vi.advanceTimersByTime(SCROLL_QUIET_MS + 50);
    });
    expect(scrollTo).not.toHaveBeenCalled();
    expect(onVisibleMonthChange).not.toHaveBeenCalled();
    // The steer ended where it arrived: a trackpad scroll on to month 11 is
    // the user's, and it reports.
    act(() => scrollBy(scroller, 11 * PANE));
    act(() => {
      vi.advanceTimersByTime(16);
    });
    expect(onVisibleMonthChange.mock.calls).toEqual([[11]]);
  });

  it('keeps a steer through a render: the settle still finishes it', () => {
    const {handleRef, scroller, select} = renderScroller();
    act(() => handleRef.current?.scrollToMonth(10));
    act(() => scrollBy(scroller, 9 * PANE + 0.3 * PANE));
    // The owner renders the scroller again mid-scroll: the settle stays
    // attached, so the steer stays.
    act(() => select({year: 2026, month: 11, day: 3}));
    scrollTo.mockClear();
    act(() => {
      vi.advanceTimersByTime(SCROLL_QUIET_MS + 50);
    });
    // On to the steered month 10, not the nearest pane (9).
    expect(
      scrollTo.mock.calls.map(([options]) => (options as ScrollToOptions).left),
    ).toEqual([10 * PANE]);
  });

  it('ends a steer on a person’s input, so the settle rounds their scroll to the nearest month', () => {
    const {handleRef, scroller} = renderScroller();
    act(() => handleRef.current?.scrollToMonth(10));
    act(() => scrollBy(scroller, 9 * PANE + 0.3 * PANE));
    // A trackpad takes the scroller part-way and stops nearer month 9.
    act(() => {
      scroller.dispatchEvent(new Event('wheel'));
    });
    scrollTo.mockClear();
    act(() => scrollBy(scroller, 9 * PANE + 0.2 * PANE));
    act(() => {
      vi.advanceTimersByTime(SCROLL_QUIET_MS + 50);
    });
    expect(
      scrollTo.mock.calls.map(([options]) => (options as ScrollToOptions).left),
    ).toEqual([9 * PANE]);
  });
});
