// Copyright (c) Meta Platforms, Inc. and affiliates.

import {act, render} from '@testing-library/react';
import {createRef} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {MonthScroller, type MonthScrollerHandle} from './MonthScroller';

/**
 * A touch screen with Reduced Motion on: the policy's combined query
 * (motion/reducedMotion.ts) and the coarse pointer both match.
 */
function stubReducedMotionTouch(): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches:
      query.includes('prefers-reduced-motion: reduce') ||
      /pointer:\s*coarse/.test(query),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

class FakeResizeObserver {
  constructor(private callback: ResizeObserverCallback) {}
  observe() {
    this.callback([], this);
  }
  unobserve() {}
  disconnect() {}
}

describe('MonthScroller under Reduced Motion on a touch screen', () => {
  const scrollTo = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    stubReducedMotionTouch();
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300);
    Element.prototype.scrollTo = scrollTo;
    Element.prototype.animate = vi.fn(() => ({
      cancel: vi.fn(),
    })) as unknown as typeof Element.prototype.animate;
    scrollTo.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function renderScroller() {
    const handleRef = createRef<MonthScrollerHandle>();
    const view = render(
      <MonthScroller
        handleRef={handleRef}
        minMonthIndex={0}
        maxMonthIndex={23}
        initialMonthIndex={9}
        onVisibleMonthChange={() => {}}
        selectedDate={null}
        today={{year: 2026, month: 10, day: 15}}
        isDateDisabled={() => false}
        weekStartsOn={0}
        onSelect={() => {}}
      />,
    );
    scrollTo.mockClear();
    return {handleRef, ...view};
  }

  it('lets a second step within the dip replace the first: only its scroll lands', () => {
    const {handleRef} = renderScroller();
    act(() => handleRef.current?.scrollToMonth(10));
    act(() => {
      vi.advanceTimersByTime(40);
    });
    act(() => handleRef.current?.scrollToMonth(11));
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it('scrolls nothing once unmounted within the dip', () => {
    const {handleRef, unmount} = renderScroller();
    act(() => handleRef.current?.scrollToMonth(10));
    unmount();
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
