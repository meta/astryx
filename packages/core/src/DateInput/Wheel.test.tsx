// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Wheel.test.tsx
 * @input Uses Vitest, Testing Library and the Wheel column
 * @output Proves where a wheel rests when it stops on a row it cannot commit
 * @position Unit coverage for Wheel.tsx's rest rule; the wheels inside the
 *   DateInput, DateTimeInput and TimeInput sheets are covered by their own
 *   touch suites
 */

import {act, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import {fakeAnimate} from '../motion/__tests__/fakeWebAnimation';
import {nearestEnabledIndex, Wheel, type WheelOption} from './Wheel';
import {SCROLL_QUIET_MS} from './useScrollSettle';

const ROW = 28;

beforeAll(() => {
  // jsdom implements no scrolling; the wheel parks its committed row on mount.
  Element.prototype.scrollTo = vi.fn();
});

/** Hours 0-23 with 09:00-17:00 bounds: 0-8 and 18-23 are disabled. */
const HOURS: WheelOption[] = Array.from({length: 24}, (_, hour) => ({
  value: hour,
  label: String(hour).padStart(2, '0'),
  isDisabled: hour < 9 || hour > 17,
}));

describe('nearestEnabledIndex', () => {
  it('keeps an enabled row', () => {
    expect(nearestEnabledIndex(HOURS, 12, 10)).toBe(12);
  });

  it('goes to the bound on the side the wheel stopped on', () => {
    expect(nearestEnabledIndex(HOURS, 7, 10)).toBe(9);
    expect(nearestEnabledIndex(HOURS, 0, 10)).toBe(9);
    expect(nearestEnabledIndex(HOURS, 20, 10)).toBe(17);
    expect(nearestEnabledIndex(HOURS, 23, 10)).toBe(17);
  });

  it('breaks a tie toward the committed row', () => {
    const gap: WheelOption[] = [
      {value: 0, label: '0'},
      {value: 1, label: '1', isDisabled: true},
      {value: 2, label: '2'},
    ];
    expect(nearestEnabledIndex(gap, 1, 0)).toBe(0);
    expect(nearestEnabledIndex(gap, 1, 2)).toBe(2);
  });

  it('stays on the committed row when no row is enabled', () => {
    const none = HOURS.map(option => ({...option, isDisabled: true}));
    expect(nearestEnabledIndex(none, 3, 10)).toBe(10);
  });
});

describe('Wheel — where it comes to rest', () => {
  afterEach(() => {
    // @ts-expect-error - deleting the shadow restores Element's own getter
    delete HTMLElement.prototype.offsetHeight;
  });

  /**
   * jsdom has no layout, so each row gets a height here. This setup records
   * the scroller's scrollTop and scrollTo, so a test can stop the wheel on any
   * row.
   */
  function renderWheel(value: number) {
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get(this: HTMLElement) {
        return this.getAttribute('role') === 'option' ? ROW : 0;
      },
    });
    const onChange = vi.fn();
    const scrollTo = vi.fn();
    const {rerender, unmount} = render(
      <Wheel label="Hour" options={HOURS} value={value} onChange={onChange} />,
    );
    const scroller = screen.getByRole('listbox', {name: 'Hour'});
    let top = value * ROW;
    Object.defineProperty(scroller, 'scrollTop', {
      configurable: true,
      get: () => top,
      set: (next: number) => {
        top = next;
      },
    });
    scroller.scrollTo = ((options: ScrollToOptions) => {
      scrollTo(options);
    }) as HTMLElement['scrollTo'];
    /** The wheel scrolls to `row` without stopping there (a drag passing it). */
    const moveTo = (row: number) => {
      act(() => {
        top = row * ROW;
        scroller.dispatchEvent(new Event('scroll'));
      });
    };
    /** The wheel scrolls to `row` and stops there. */
    const stopOn = (row: number) => {
      act(() => {
        top = row * ROW;
        scroller.dispatchEvent(new Event('scroll'));
        scroller.dispatchEvent(new Event('scrollend'));
      });
    };
    return {onChange, scrollTo, moveTo, stopOn, rerender, unmount};
  }

  it('commits an enabled row it stops on', () => {
    const {onChange, scrollTo, stopOn} = renderWheel(10);
    stopOn(12);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith(12);
  });

  it('stopping below the minimum travels on to the minimum and commits it there', () => {
    const {onChange, scrollTo, stopOn} = renderWheel(10);
    stopOn(7);
    // Not back to the committed 10: on to 9, the nearest hour in bounds.
    expect(scrollTo).toHaveBeenCalledWith({top: 9 * ROW, behavior: 'smooth'});
    expect(onChange).not.toHaveBeenCalled();
    // The second rest, on 9, commits it.
    stopOn(9);
    expect(onChange).toHaveBeenCalledWith(9);
  });

  it('stopping past the maximum travels back to the maximum', () => {
    const {onChange, scrollTo, stopOn} = renderWheel(10);
    stopOn(21);
    expect(scrollTo).toHaveBeenCalledWith({
      top: 17 * ROW,
      behavior: 'smooth',
    });
    stopOn(17);
    expect(onChange).toHaveBeenCalledWith(17);
  });

  it('opening on a value outside the bounds parks on it without travelling or committing', () => {
    // 08:00 with 09:00-17:00 bounds: the sheet opens, the wheel parks on 8,
    // and the browser reports that scroll's rest. Nobody touched the wheel,
    // so nothing may move or commit.
    const {onChange, scrollTo, stopOn} = renderWheel(8);
    stopOn(8);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a drag that comes back to rest on a committed value outside the bounds stays there and commits nothing (component:DateInput FR13)', () => {
    // 08:00 with 09:00-17:00 bounds: a drag carries the wheel to 10 and back
    // onto 8 before it rests. Resting on the committed row is not a stop to
    // correct, even outside the bounds: it stays on 8 and commits nothing.
    const {onChange, scrollTo, moveTo, stopOn} = renderWheel(8);
    moveTo(10);
    stopOn(8);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('turns onto a value set while it is shown, as a bound clamping the time after another wheel turned (component:DateInput FR14)', () => {
    // 22:00 is past the 17:00 maximum, so the field clamps to 17:00. The hour
    // wheel rests on 22 and turns onto 17, as UIDatePicker's does. It never
    // jumps there and commits nothing of its own.
    const {onChange, scrollTo, rerender} = renderWheel(22);
    scrollTo.mockClear();
    rerender(
      <Wheel label="Hour" options={HOURS} value={17} onChange={onChange} />,
    );
    expect(scrollTo).toHaveBeenCalledWith({top: 17 * ROW, behavior: 'smooth'});
    expect(scrollTo).not.toHaveBeenCalledWith({
      top: 17 * ROW,
      behavior: 'auto',
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a stop on another disabled row still travels to the bounds', () => {
    const {onChange, scrollTo, stopOn} = renderWheel(8);
    stopOn(6);
    expect(scrollTo).toHaveBeenCalledWith({top: 9 * ROW, behavior: 'smooth'});
    stopOn(9);
    expect(onChange).toHaveBeenCalledWith(9);
  });

  describe('under reduced motion', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    });

    /** Reduced motion on, with a fine or a coarse primary pointer. */
    function stubReducedMotion(pointer: 'fine' | 'coarse') {
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches:
          query === '(prefers-reduced-motion: reduce)' ||
          (query === '(pointer: coarse)' && pointer === 'coarse'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }));
    }

    it('lands on the nearest row in bounds at once with a mouse', () => {
      stubReducedMotion('fine');
      expect(window.matchMedia('(pointer: coarse)').matches).toBe(false);
      const {scrollTo, stopOn} = renderWheel(10);
      stopOn(7);
      expect(scrollTo).toHaveBeenCalledWith({top: 9 * ROW, behavior: 'auto'});
      expect(scrollTo).not.toHaveBeenCalledWith(
        expect.objectContaining({behavior: 'smooth'}),
      );
    });

    it('cross-fades onto it on a touch screen: opacity only, 200 ms', async () => {
      stubReducedMotion('coarse');
      const {scrollTo, stopOn} = renderWheel(10);
      const scroller = screen.getByRole('listbox', {name: 'Hour'});
      const {animate, animations} = fakeAnimate();
      scroller.animate = animate;
      stopOn(7);
      // Out, then back in after the rows land: opacity alone.
      expect(animations).toHaveLength(1);
      expect(animations[0].keyframes.map(frame => frame.opacity)).toEqual([
        1, 0,
      ]);
      expect(scrollTo).not.toHaveBeenCalled();
      await act(async () => animations[0].finish());
      // The rows land at the dip's midpoint, with no travel.
      expect(scrollTo).toHaveBeenCalledWith({top: 9 * ROW, behavior: 'auto'});
      expect(animations).toHaveLength(2);
      expect(animations[1].keyframes.map(frame => frame.opacity)).toEqual([
        0, 1,
      ]);
      for (const {keyframes} of animations) {
        for (const frame of keyframes) {
          expect(
            Object.keys(frame).filter(
              key => key !== 'offset' && key !== 'easing',
            ),
          ).toEqual(['opacity']);
        }
      }
      const total = animations.reduce(
        (sum, {options}) => sum + Number(options.duration),
        0,
      );
      expect(total).toBeLessThanOrEqual(200);
    });

    it('lands the rows only when the fade-out ends, however late its frame comes', async () => {
      // design:reduced-motion DR2: a timer at the dip's middle could fire
      // after the fade-in began, and the rows would move fully visible.
      stubReducedMotion('coarse');
      vi.useFakeTimers();
      const {scrollTo, stopOn} = renderWheel(10);
      const scroller = screen.getByRole('listbox', {name: 'Hour'});
      const {animate, animations} = fakeAnimate();
      scroller.animate = animate;
      stopOn(7);
      act(() => {
        vi.advanceTimersByTime(10_000);
      });
      expect(scrollTo).not.toHaveBeenCalled();
      expect(animations).toHaveLength(1);
      await act(async () => animations[0].finish());
      expect(scrollTo.mock.calls).toEqual([[{top: 9 * ROW, behavior: 'auto'}]]);
    });

    it('steps with the arrow keys at once with a keyboard', () => {
      stubReducedMotion('fine');
      const {scrollTo} = renderWheel(10);
      const scroller = screen.getByRole('listbox', {name: 'Hour'});
      act(() => {
        scroller.dispatchEvent(
          new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}),
        );
      });
      expect(scrollTo).toHaveBeenCalledWith({
        top: 11 * ROW,
        behavior: 'auto',
      });
    });

    /** Steps the wheel down one row with the keyboard. */
    function pressArrowDown() {
      const scroller = screen.getByRole('listbox', {name: 'Hour'});
      act(() => {
        scroller.dispatchEvent(
          new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}),
        );
      });
    }

    it('lands an arrow key step on a touch screen under its cross-fade, not before', async () => {
      stubReducedMotion('coarse');
      const {onChange, scrollTo, rerender} = renderWheel(10);
      const scroller = screen.getByRole('listbox', {name: 'Hour'});
      const {animate, animations} = fakeAnimate();
      scroller.animate = animate;
      pressArrowDown();
      expect(onChange).toHaveBeenCalledWith(11);
      // The parent takes the step. The new value must not move the rows
      // while they are still fully visible: they land under the dip.
      rerender(
        <Wheel label="Hour" options={HOURS} value={11} onChange={onChange} />,
      );
      expect(animations).toHaveLength(1);
      expect(scrollTo).not.toHaveBeenCalled();
      await act(async () => animations[0].finish());
      expect(scrollTo.mock.calls).toEqual([
        [{top: 11 * ROW, behavior: 'auto'}],
      ]);
    });

    it('starts a second step’s dip where the first one’s fade-in has the column', async () => {
      // design:reduced-motion DR2: a leaving element fades out where it is,
      // so a step during the last dip's fade-in never pops back to opaque.
      stubReducedMotion('coarse');
      renderWheel(10);
      const scroller = screen.getByRole('listbox', {name: 'Hour'});
      const {animate, animations} = fakeAnimate();
      scroller.animate = animate;
      pressArrowDown();
      expect(animations[0].keyframes[0].opacity).toBe(1);
      // The rows have landed, and the column fades back in.
      await act(async () => animations[0].finish());
      expect(animations).toHaveLength(2);
      scroller.style.opacity = '0.5';
      pressArrowDown();
      expect(animations).toHaveLength(3);
      // The fade-in stops, and the next fade-out starts where it was.
      expect(animations[1].cancel).toHaveBeenCalled();
      expect(animations[2].keyframes.map(frame => frame.opacity)).toEqual([
        0.5, 0,
      ]);
    });

    it('lands nothing once unmounted within the fade-out', async () => {
      stubReducedMotion('coarse');
      const {scrollTo, stopOn, unmount} = renderWheel(10);
      const scroller = screen.getByRole('listbox', {name: 'Hour'});
      const {animate, animations} = fakeAnimate();
      scroller.animate = animate;
      stopOn(7);
      unmount();
      expect(animations[0].cancel).toHaveBeenCalled();
      await act(async () => animations[0].finish());
      expect(scrollTo).not.toHaveBeenCalled();
    });

    it('changes at once after an earlier touch on a fine pointer, for a key or a tap', () => {
      // This is a laptop's touch screen: its primary pointer is fine. Only a
      // touch drag's release fades. A key step or a row tap lands at once.
      stubReducedMotion('fine');
      const {scrollTo} = renderWheel(10);
      const scroller = screen.getByRole('listbox', {name: 'Hour'});
      const animate = vi.fn();
      scroller.animate = animate as HTMLElement['animate'];
      fireEvent.pointerDown(scroller, {pointerType: 'touch'});
      pressArrowDown();
      expect(scrollTo).toHaveBeenLastCalledWith({
        top: 11 * ROW,
        behavior: 'auto',
      });
      fireEvent.pointerDown(scroller, {pointerType: 'touch'});
      fireEvent.click(screen.getByRole('option', {name: '13'}));
      expect(scrollTo).toHaveBeenLastCalledWith({
        top: 13 * ROW,
        behavior: 'auto',
      });
      expect(animate).not.toHaveBeenCalled();
    });

    it('cross-fades the travel after a touch drag on a fine pointer', async () => {
      stubReducedMotion('fine');
      const {scrollTo, stopOn} = renderWheel(10);
      const scroller = screen.getByRole('listbox', {name: 'Hour'});
      const {animate, animations} = fakeAnimate();
      scroller.animate = animate;
      fireEvent.pointerDown(scroller, {pointerType: 'touch'});
      stopOn(7);
      expect(animations).toHaveLength(1);
      expect(scrollTo).not.toHaveBeenCalled();
      await act(async () => animations[0].finish());
      expect(scrollTo).toHaveBeenCalledWith({top: 9 * ROW, behavior: 'auto'});
    });

    /** A primary mouse press, move or release, as usePointerDragScroll reads it. */
    const mouse = (type: string, y: number) => {
      const event = new Event(type, {bubbles: true, cancelable: true});
      Object.defineProperties(event, {
        clientY: {value: y},
        pointerId: {value: 1},
        pointerType: {value: 'mouse'},
        button: {value: 0},
      });
      return event;
    };

    /** jsdom has no pointer capture, which a mouse drag takes. */
    const capturable = (scroller: HTMLElement) => {
      scroller.setPointerCapture = () => {};
      scroller.releasePointerCapture = () => {};
      scroller.hasPointerCapture = () => true;
    };

    it('travels at once after a mouse drag that follows a touch, on a fine pointer', () => {
      // usePointerDragScroll stops a primary mouse press from bubbling, so that
      // it does not reach BottomSheet's drag. So the wheel reads the pointer in
      // the capture phase, before that.
      stubReducedMotion('fine');
      vi.useFakeTimers();
      const {scrollTo, stopOn} = renderWheel(10);
      const scroller = screen.getByRole('listbox', {name: 'Hour'});
      capturable(scroller);
      const animate = vi.fn();
      scroller.animate = animate as HTMLElement['animate'];
      fireEvent.pointerDown(scroller, {pointerType: 'touch'});
      act(() => {
        scroller.dispatchEvent(mouse('pointerdown', 200));
        // Pulled down three rows: 7, below the minimum.
        scroller.dispatchEvent(mouse('pointermove', 200 + 3 * ROW));
        scroller.dispatchEvent(mouse('pointerup', 200 + 3 * ROW));
      });
      stopOn(7);
      expect(animate).not.toHaveBeenCalled();
      expect(scrollTo).toHaveBeenLastCalledWith({
        top: 9 * ROW,
        behavior: 'auto',
      });
    });

    it('waits for a mouse drag’s release before travelling back inside the bounds', () => {
      // Each scrollTop the drag assigns ends in its own scrollend in Chromium,
      // and the hand can pause with the button down: neither is rest.
      stubReducedMotion('fine');
      vi.useFakeTimers();
      const {scrollTo, onChange} = renderWheel(10);
      const scroller = screen.getByRole('listbox', {name: 'Hour'});
      capturable(scroller);
      act(() => {
        scroller.dispatchEvent(mouse('pointerdown', 200));
        scroller.dispatchEvent(mouse('pointermove', 200 + 3 * ROW));
        scroller.dispatchEvent(new Event('scroll'));
        scroller.dispatchEvent(new Event('scrollend'));
        vi.advanceTimersByTime(SCROLL_QUIET_MS * 2);
      });
      expect(scrollTo).not.toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
      act(() => {
        scroller.dispatchEvent(mouse('pointerup', 200 + 3 * ROW));
        scroller.dispatchEvent(new Event('scrollend'));
      });
      expect(scrollTo).toHaveBeenLastCalledWith({
        top: 9 * ROW,
        behavior: 'auto',
      });
      expect(onChange).not.toHaveBeenCalled();
    });

    it('travels at once after a trackpad scroll that follows a touch, on a fine pointer', () => {
      stubReducedMotion('fine');
      const {scrollTo, stopOn} = renderWheel(10);
      const scroller = screen.getByRole('listbox', {name: 'Hour'});
      const animate = vi.fn();
      scroller.animate = animate as HTMLElement['animate'];
      fireEvent.pointerDown(scroller, {pointerType: 'touch'});
      fireEvent.wheel(scroller, {deltaY: -120});
      stopOn(7);
      expect(animate).not.toHaveBeenCalled();
      expect(scrollTo).toHaveBeenCalledWith({top: 9 * ROW, behavior: 'auto'});
    });
  });

  it('never commits a disabled row, even with nowhere valid to go', () => {
    const none = HOURS.map(option => ({...option, isDisabled: true}));
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get(this: HTMLElement) {
        return this.getAttribute('role') === 'option' ? ROW : 0;
      },
    });
    const onChange = vi.fn();
    render(
      <Wheel label="Hour" options={none} value={10} onChange={onChange} />,
    );
    const scroller = screen.getByRole('listbox', {name: 'Hour'});
    let top = 10 * ROW;
    Object.defineProperty(scroller, 'scrollTop', {
      configurable: true,
      get: () => top,
    });
    scroller.scrollTo = vi.fn() as HTMLElement['scrollTo'];
    act(() => {
      top = 4 * ROW;
      scroller.dispatchEvent(new Event('scroll'));
      scroller.dispatchEvent(new Event('scrollend'));
    });
    expect(scroller.scrollTo).toHaveBeenCalledWith({
      top: 10 * ROW,
      behavior: 'smooth',
    });
    expect(onChange).not.toHaveBeenCalled();
  });
});
