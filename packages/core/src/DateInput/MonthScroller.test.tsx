// Copyright (c) Meta Platforms, Inc. and affiliates.

import {act, render} from '@testing-library/react';
import {createRef} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  fakeAnimate,
  type FakeAnimation,
} from '../motion/__tests__/fakeWebAnimation';
import {MonthScroller, type MonthScrollerHandle} from './MonthScroller';
import {createMonthModel} from './monthGeometry';

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
  // The dips' animations, in order. A fade-out ends only when a test ends it.
  let animations: FakeAnimation[] = [];
  /** The newest dip's fade-out ends: its step lands. */
  async function endFadeOut() {
    await act(async () => animations[animations.length - 1].finish());
  }
  beforeEach(() => {
    vi.useFakeTimers();
    stubReducedMotionTouch();
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300);
    Element.prototype.scrollTo = scrollTo;
    const fake = fakeAnimate();
    Element.prototype.animate = fake.animate;
    animations = fake.animations;
    // mockReset, not mockClear: a test's implementation must not outlive it.
    scrollTo.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function renderScroller({
    onVisibleMonthChange = () => {},
  }: {onVisibleMonthChange?: (monthIndex: number) => void} = {}) {
    const handleRef = createRef<MonthScrollerHandle>();
    const view = render(
      <MonthScroller
        handleRef={handleRef}
        monthModel={createMonthModel('gregory')}
        minMonthIndex={0}
        maxMonthIndex={23}
        initialMonthIndex={9}
        onVisibleMonthChange={onVisibleMonthChange}
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

  it('lets a second step within the dip replace the first: only its scroll lands', async () => {
    const {handleRef} = renderScroller();
    act(() => handleRef.current?.scrollToMonth(10));
    const first = animations[0];
    act(() => handleRef.current?.scrollToMonth(11));
    expect(first.cancel).toHaveBeenCalled();
    // The replaced dip's fade-out ending lands nothing.
    await act(async () => first.finish());
    expect(scrollTo).not.toHaveBeenCalled();
    await endFadeOut();
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it('lands a step to another month before its fade-in starts', async () => {
    // The fade-in starts as soon as the landing returns. A month that only
    // scheduled its scroll then would change fully visible on a busy page.
    const {handleRef} = renderScroller();
    const order: string[] = [];
    scrollTo.mockImplementation(() => {
      order.push('scroll');
    });
    const fake = fakeAnimate();
    Element.prototype.animate = function (
      this: Element,
      ...args: Parameters<Element['animate']>
    ) {
      order.push('animate');
      return fake.animate.apply(this, args);
    };
    act(() => handleRef.current?.scrollToMonth(10));
    expect(order).toEqual(['animate']);
    await act(async () => fake.animations[0].finish());
    expect(order).toEqual(['animate', 'scroll', 'animate']);
  });

  it('lands a step only when its fade-out ends, however late its frame comes', async () => {
    // design:reduced-motion DR2: a timer at the dip's middle could fire after
    // the fade-in began, and the month would change fully visible.
    const {handleRef} = renderScroller();
    act(() => handleRef.current?.scrollToMonth(10));
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(scrollTo).not.toHaveBeenCalled();
    await endFadeOut();
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it('keeps a jump to a distant month made within the dip: the dip does not land after it', async () => {
    const {handleRef} = renderScroller();
    act(() => handleRef.current?.scrollToMonth(10));
    const dip = animations[0];
    // Eleven months on: beyond the mounted window, so it jumps at once.
    act(() => handleRef.current?.scrollToMonth(20));
    await act(async () => dip.finish());
    expect(
      scrollTo.mock.calls.map(([options]) => (options as ScrollToOptions).left),
    ).toEqual([20 * 300]);
  });

  it('keeps a step at once made within the dip: the dip does not land after it', async () => {
    const {handleRef} = renderScroller();
    act(() => handleRef.current?.scrollToMonth(10));
    const dip = animations[0];
    act(() => handleRef.current?.scrollToMonth(8, 'auto'));
    await act(async () => dip.finish());
    expect(
      scrollTo.mock.calls.map(([options]) => (options as ScrollToOptions).left),
    ).toEqual([8 * 300]);
  });

  it('reports a trackpad scroll after a step lands, even with an earlier steer that never arrived', async () => {
    const onVisibleMonthChange = vi.fn();
    const {handleRef, container} = renderScroller({onVisibleMonthChange});
    const scroller = container.querySelector<HTMLElement>(
      '[data-scroller="months"]',
    );
    if (scroller == null) {
      throw new Error('no scroller');
    }
    // The re-assert when the wheels close: a steer to the month already in
    // view, whose scroll never arrives.
    act(() => handleRef.current?.scrollToMonth(9, 'auto'));
    // A step lands at its dip's middle.
    act(() => handleRef.current?.scrollToMonth(10));
    await endFadeOut();
    // A trackpad scroll on to the next month: no touch ends the steer.
    act(() => {
      scroller.scrollLeft = 11 * 300;
      scroller.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(50);
    });
    expect(onVisibleMonthChange).toHaveBeenLastCalledWith(11);
  });

  it('scrolls nothing once unmounted within the dip', async () => {
    const {handleRef, unmount} = renderScroller();
    act(() => handleRef.current?.scrollToMonth(10));
    unmount();
    expect(animations[0].cancel).toHaveBeenCalled();
    await endFadeOut();
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
