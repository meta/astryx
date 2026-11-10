// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Wheel.test.tsx
 * @input Uses Vitest, Testing Library, the Wheel column and a stubbed
 *   matchMedia (and CSS.supports, to show the engine does not matter)
 * @output Proves where today's wheel rests when it stops on a row it cannot
 *   commit, and which column (and which frame) each primary pointer draws
 * @position Unit coverage for Wheel.tsx: the switch and today's column
 *   (PickerWheel.test.tsx covers the touch column); the wheels inside the
 *   DateInput, DateTimeInput and TimeInput sheets are covered by their own
 *   touch suites
 */

import {createRef, useState} from 'react';
import {act, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import {fakeAnimate} from '../motion/__tests__/fakeWebAnimation';
import {
  nearestEnabledIndex,
  ScrollWheel,
  Wheel,
  type WheelHandle,
  type WheelOption,
} from './Wheel';
import {SCROLL_QUIET_MS} from './useScrollSettle';
import {loopedStep, restingLoopStep} from './wheelOptions';

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

describe('the looping wheel’s rules', () => {
  /** Enabled where `isEnabled` holds for the row a position shows. */
  const rowsWhere =
    (isEnabled: (row: number) => boolean, count = 60) =>
    (position: number) =>
      isEnabled(((position % count) + count) % count);

  it('rests beside the seam by turning the shorter way round', () => {
    // Months with only January and February enabled: from December, January
    // is one row on, February two.
    const early = rowsWhere(row => row < 2, 12);
    expect(restingLoopStep(early, 11, 1, 12)).toBe(1);
    expect(restingLoopStep(early, 0, 1, 12)).toBe(0);
  });

  it('steps a key in its own direction across the seam, never a whole turn', () => {
    const every = () => true;
    expect(loopedStep(every, 59, 1, 60)).toBe(1);
    expect(loopedStep(every, 0, -1, 60)).toBe(-1);
    expect(loopedStep(every, 3, 60, 60)).toBeNull();
    const onlyOne = rowsWhere(row => row === 30);
    expect(loopedStep(onlyOne, 30, 1, 60)).toBeNull();
  });

  it('skips disabled rows across the seam', () => {
    // 00-05 and 55-58 enabled, 59 disabled.
    const bounded = rowsWhere(row => row <= 5 || (row >= 55 && row <= 58));
    expect(loopedStep(bounded, 58, 1, 60)).toBe(2);
    expect(loopedStep(bounded, 0, -1, 60)).toBe(-2);
  });

  it('never turns a key the long way round, nor against its direction', () => {
    // Only 00-05 enabled: past :05 the next enabled row in either key's
    // direction lies more than half a turn away, so the key stays put.
    const early = rowsWhere(row => row <= 5);
    expect(loopedStep(early, 5, 1, 60)).toBeNull();
    expect(loopedStep(early, 0, -1, 60)).toBeNull();
    expect(loopedStep(early, 4, 1, 60)).toBe(1);
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
  function renderWheel(value: number, Column: typeof ScrollWheel = Wheel) {
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get(this: HTMLElement) {
        return this.getAttribute('role') === 'option' ? ROW : 0;
      },
    });
    const onChange = vi.fn();
    const scrollTo = vi.fn();
    const {rerender, unmount} = render(
      <Column label="Hour" options={HOURS} value={value} onChange={onChange} />,
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

    it('cross-fades onto it after a touch: opacity only, 200 ms', async () => {
      // A touch screen whose primary pointer is fine (a laptop's): today's
      // column, and a touch release fades (DR2).
      stubReducedMotion('fine');
      const {scrollTo, stopOn} = renderWheel(10);
      const scroller = screen.getByRole('listbox', {name: 'Hour'});
      fireEvent.pointerDown(scroller, {pointerType: 'touch'});
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
      stubReducedMotion('fine');
      vi.useFakeTimers();
      const {scrollTo, stopOn} = renderWheel(10);
      const scroller = screen.getByRole('listbox', {name: 'Hour'});
      fireEvent.pointerDown(scroller, {pointerType: 'touch'});
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

    it('lands an arrow key step on a coarse pointer under its cross-fade, not before', async () => {
      // A finger gets the touch column (PickerWheel.test.tsx); today's
      // column keeps its dip for a coarse pointer wherever it is rendered.
      stubReducedMotion('coarse');
      const {onChange, scrollTo, rerender} = renderWheel(10, ScrollWheel);
      const scroller = screen.getByRole('listbox', {name: 'Hour'});
      const {animate, animations} = fakeAnimate();
      scroller.animate = animate;
      pressArrowDown();
      expect(onChange).toHaveBeenCalledWith(11);
      // The parent takes the step. The new value must not move the rows
      // while they are still fully visible: they land under the dip.
      rerender(
        <ScrollWheel
          label="Hour"
          options={HOURS}
          value={11}
          onChange={onChange}
        />,
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
      // A finger gets the touch column (PickerWheel.test.tsx); today's
      // column keeps its dip for a coarse pointer wherever it is rendered.
      stubReducedMotion('coarse');
      renderWheel(10, ScrollWheel);
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
      stubReducedMotion('fine');
      const {scrollTo, stopOn, unmount} = renderWheel(10);
      const scroller = screen.getByRole('listbox', {name: 'Hour'});
      fireEvent.pointerDown(scroller, {pointerType: 'touch'});
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

describe('Wheel — keys under a mouse', () => {
  /** The scrolling column over `options`, whose owner commits each change. */
  function OwnedColumn({
    options,
    initial,
    onChange,
  }: {
    options: WheelOption[];
    initial: number;
    onChange: (value: number) => void;
  }) {
    const [value, setValue] = useState(initial);
    return (
      <ScrollWheel
        label="Hour"
        options={options}
        value={value}
        onChange={next => {
          onChange(next);
          setValue(next);
        }}
      />
    );
  }

  function renderColumn(options: WheelOption[], initial: number) {
    const onChange = vi.fn();
    render(
      <OwnedColumn options={options} initial={initial} onChange={onChange} />,
    );
    return {listbox: screen.getByRole('listbox', {name: 'Hour'}), onChange};
  }

  it('at a 12:00–17:00 bound, moves a key to the next enabled row and stops at the last one', () => {
    const bound = HOURS.map(option => ({
      ...option,
      isDisabled: option.value < 12 || option.value > 17,
    }));
    const {listbox, onChange} = renderColumn(bound, 17);
    // No enabled row lies below 17: these keys commit nothing.
    for (const key of ['ArrowDown', 'PageDown', 'End']) {
      fireEvent.keyDown(listbox, {key});
    }
    expect(onChange).not.toHaveBeenCalled();
    // PageUp's target, 7, is past the bound: the key stops at 12.
    fireEvent.keyDown(listbox, {key: 'PageUp'});
    expect(onChange).toHaveBeenLastCalledWith(12);
    fireEvent.keyDown(listbox, {key: 'ArrowUp'});
    fireEvent.keyDown(listbox, {key: 'Home'});
    expect(onChange).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(listbox, {key: 'End'});
    expect(onChange).toHaveBeenLastCalledWith(17);
  });

  it('at a 12:00–17:00 bound on a 12-hour hour wheel, steps in time order: nothing after 5 PM, and 1 PM after 12 PM', () => {
    // The PM hours as the 12-hour wheel lists them, 1 to 12, each standing for
    // its full hour: 12 (noon) comes before 1. Noon to 5 PM are in the bound.
    const pmHours = Array.from({length: 12}, (_, index) => {
      const hour = index + 1;
      const hour24 = hour === 12 ? 12 : hour + 12;
      return {
        value: hour,
        label: String(hour),
        order: hour24,
        isDisabled: hour24 > 17,
      };
    });
    const {listbox, onChange} = renderColumn(pmHours, 5);
    for (const key of ['ArrowDown', 'PageDown', 'End']) {
      fireEvent.keyDown(listbox, {key});
    }
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(listbox, {key: 'Home'});
    expect(onChange).toHaveBeenLastCalledWith(12);
    fireEvent.keyDown(listbox, {key: 'ArrowDown'});
    expect(onChange).toHaveBeenLastCalledWith(1);
    fireEvent.keyDown(listbox, {key: 'ArrowUp'});
    expect(onChange).toHaveBeenLastCalledWith(12);
  });

  it('moves a key from a row outside the bounds onto the first enabled row in its direction', () => {
    const bound = HOURS.map(option => ({
      ...option,
      isDisabled: option.value < 12 || option.value > 17,
    }));
    const {listbox, onChange} = renderColumn(bound, 20);
    fireEvent.keyDown(listbox, {key: 'ArrowDown'});
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(listbox, {key: 'ArrowUp'});
    expect(onChange).toHaveBeenLastCalledWith(17);
  });
});

describe('Wheel — a key step on a page starved of frames', () => {
  afterEach(() => {
    vi.useRealTimers();
    // @ts-expect-error - deleting the shadow restores Element's own getter
    delete HTMLElement.prototype.offsetHeight;
  });

  /** Each row gets a height: jsdom has no layout. */
  function giveRowsHeight() {
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get(this: HTMLElement) {
        return this.getAttribute('role') === 'option' ? ROW : 0;
      },
    });
  }

  /**
   * Plays the browser for the scrolling column `listbox`, resting on hour
   * `initial`. `frame` draws one frame of a scroll at the `scrollTop` it
   * gives, and `wait` moves the clock. A starved page waits without drawing.
   * `scrollTo` records each scroll the wheel starts, and `land` plays the
   * browser ending the last one where it aimed, with `scrollend`.
   */
  function playBrowser(listbox: HTMLElement, initial: number) {
    let top = initial * ROW;
    Object.defineProperty(listbox, 'scrollTop', {
      configurable: true,
      get: () => top,
      set: (next: number) => {
        top = next;
      },
    });
    const frame = (at: number) => {
      act(() => {
        top = at;
        listbox.dispatchEvent(new Event('scroll'));
      });
    };
    const wait = (ms: number) => {
      act(() => {
        vi.advanceTimersByTime(ms);
      });
    };
    const scrollTo = vi.fn();
    listbox.scrollTo = ((options: ScrollToOptions) => {
      scrollTo(options);
    }) as HTMLElement['scrollTo'];
    const land = () => {
      const last = scrollTo.mock.lastCall?.[0] as ScrollToOptions | undefined;
      if (last?.top == null) {
        throw new Error('no scroll to land');
      }
      frame(last.top);
      act(() => {
        listbox.dispatchEvent(new Event('scrollend'));
      });
    };
    /** The column rests on `row`: the row the value names is the row shown. */
    const expectRestOn = (row: number) => {
      expect(Math.abs(listbox.scrollTop - row * ROW)).toBeLessThanOrEqual(0.5);
    };
    return {frame, wait, scrollTo, land, expectRestOn};
  }

  /** The scrolling column on hour `initial`, whose owner commits each change. */
  function renderStepped(initial: number) {
    giveRowsHeight();
    const onChange = vi.fn();
    function Owned() {
      const [value, setValue] = useState(initial);
      return (
        <ScrollWheel
          label="Hour"
          options={HOURS}
          value={value}
          onChange={next => {
            onChange(next);
            setValue(next);
          }}
        />
      );
    }
    render(<Owned />);
    const listbox = screen.getByRole('listbox', {name: 'Hour'});
    return {listbox, onChange, ...playBrowser(listbox, initial)};
  }

  /**
   * The scrolling column on hour `initial`, shown. `show` sets its value and
   * whether it is shown, as DateInput's sheet does when the wheels close and
   * the calendar moves.
   */
  function renderShown(initial: number) {
    giveRowsHeight();
    const onChange = vi.fn();
    const column = (value: number, isActive: boolean) => (
      <ScrollWheel
        label="Hour"
        options={HOURS}
        value={value}
        onChange={onChange}
        isActive={isActive}
      />
    );
    const {rerender} = render(column(initial, true));
    const listbox = screen.getByRole('listbox', {name: 'Hour'});
    const show = (value: number, isActive: boolean) => {
      rerender(column(value, isActive));
    };
    return {listbox, onChange, show, ...playBrowser(listbox, initial)};
  }

  it('rests on the row a key steps to when its frames stop for longer than the quiet period', () => {
    vi.useFakeTimers();
    const {listbox, onChange, frame, wait, scrollTo, expectRestOn} =
      renderStepped(10);
    fireEvent.keyDown(listbox, {key: 'ArrowDown'});
    expect(onChange.mock.calls).toEqual([[11]]);
    scrollTo.mockClear();
    // The step's first frame, a fifth of a row along. Then no frame comes for
    // longer than the quiet period, as on a busy page or a slow device.
    frame(10 * ROW + 6);
    wait(SCROLL_QUIET_MS + 80);
    // The row the step is leaving is not a rest: the step re-aims at 11, once.
    expect(onChange.mock.calls).toEqual([[11]]);
    expect(scrollTo.mock.calls).toEqual([
      [{top: 11 * ROW, behavior: 'smooth'}],
    ]);
    scrollTo.mockClear();
    frame(11 * ROW);
    act(() => {
      listbox.dispatchEvent(new Event('scrollend'));
    });
    expect(onChange.mock.calls).toEqual([[11]]);
    expectRestOn(11);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('keeps the row a key steps to when the quiet period of a scroll before the key ends first', () => {
    vi.useFakeTimers();
    const {listbox, onChange, frame, wait, scrollTo, land, expectRestOn} =
      renderStepped(10);
    // A glide that ends on 10 just before the key: its quiet period runs on.
    frame(10 * ROW - 5);
    frame(10 * ROW);
    fireEvent.keyDown(listbox, {key: 'ArrowDown'});
    scrollTo.mockClear();
    // That quiet period ends before the step draws its first frame.
    wait(SCROLL_QUIET_MS);
    expect(onChange.mock.calls).toEqual([[11]]);
    expect(scrollTo.mock.calls).toEqual([
      [{top: 11 * ROW, behavior: 'smooth'}],
    ]);
    land();
    expect(onChange.mock.calls).toEqual([[11]]);
    expectRestOn(11);
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it('finishes a key step that stops short of its row instead of rounding it back, without scrollend', () => {
    vi.useFakeTimers();
    const {listbox, onChange, frame, wait, scrollTo, land, expectRestOn} =
      renderStepped(10);
    fireEvent.keyDown(listbox, {key: 'ArrowDown'});
    // The step stops 30 px short of row 11, back on row 10, as when a layout
    // change moves the snap points mid-step. No person touches the wheel.
    frame(11 * ROW - 30);
    scrollTo.mockClear();
    wait(SCROLL_QUIET_MS + 10);
    expect(onChange.mock.calls).toEqual([[11]]);
    expect(scrollTo.mock.calls).toEqual([
      [{top: 11 * ROW, behavior: 'smooth'}],
    ]);
    land();
    expect(onChange.mock.calls).toEqual([[11]]);
    expectRestOn(11);
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it('commits the row the column shows when a key step rests short of its row again, with no progress', () => {
    vi.useFakeTimers();
    const {listbox, onChange, frame, wait, scrollTo, expectRestOn} =
      renderStepped(10);
    fireEvent.keyDown(listbox, {key: 'ArrowDown'});
    // The step's scroll snaps back onto row 10, and so does the re-aim.
    frame(10 * ROW + 6);
    frame(10 * ROW);
    scrollTo.mockClear();
    wait(SCROLL_QUIET_MS + 10);
    frame(10 * ROW + 6);
    frame(10 * ROW);
    wait(SCROLL_QUIET_MS + 10);
    // It re-aims once, then the value follows the row the column shows.
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls).toEqual([[11], [10]]);
    expectRestOn(10);
  });

  it('finishes a second key step that the browser ends part-way instead of rounding it back', () => {
    vi.useFakeTimers();
    const {listbox, onChange, frame, scrollTo, land, expectRestOn} =
      renderStepped(10);
    fireEvent.keyDown(listbox, {key: 'ArrowDown'});
    fireEvent.keyDown(listbox, {key: 'ArrowDown'});
    expect(onChange.mock.calls).toEqual([[11], [12]]);
    scrollTo.mockClear();
    // WebKit ends a smooth scroll that a second one retargeted once the
    // first one's time is up, with `scrollend` near row 11.
    frame(11 * ROW + 3);
    act(() => {
      listbox.dispatchEvent(new Event('scrollend'));
    });
    expect(onChange.mock.calls).toEqual([[11], [12]]);
    expect(scrollTo.mock.calls).toEqual([
      [{top: 12 * ROW, behavior: 'smooth'}],
    ]);
    land();
    expect(onChange.mock.calls).toEqual([[11], [12]]);
    expectRestOn(12);
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it('parks on the value it is shown with after a hide, though a scroll of its own never moved', () => {
    vi.useFakeTimers();
    const {onChange, show, scrollTo, land, expectRestOn} = renderShown(10);
    // A click on the row already under the band: its scroll moves nothing,
    // so it never comes to rest.
    fireEvent.click(screen.getByRole('option', {name: '10'}));
    expect(onChange).not.toHaveBeenCalled();
    // The wheels close, the calendar moves on, and the wheels open again.
    show(10, false);
    show(11, false);
    scrollTo.mockClear();
    show(11, true);
    // The wheel parks on 11 and rests there. Nothing turns it back to 10.
    land();
    expect(onChange).not.toHaveBeenCalled();
    expectRestOn(11);
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it('rests on the row a key steps to a quiet period after the frame that reaches it, without scrollend', () => {
    vi.useFakeTimers();
    const {listbox, onChange, frame, wait} = renderStepped(10);
    fireEvent.keyDown(listbox, {key: 'ArrowDown'});
    frame(10 * ROW + 6);
    frame(11 * ROW);
    wait(SCROLL_QUIET_MS + 10);
    expect(onChange.mock.calls).toEqual([[11]]);
    // At rest, a key steps on from 11.
    fireEvent.keyDown(listbox, {key: 'ArrowDown'});
    expect(onChange).toHaveBeenLastCalledWith(12);
  });

  it.each([
    [
      'a trackpad',
      (listbox: HTMLElement) => fireEvent.wheel(listbox, {deltaY: 60}),
      () => {},
    ],
    [
      'a finger',
      (listbox: HTMLElement) => fireEvent.touchStart(listbox),
      (listbox: HTMLElement) => fireEvent.touchEnd(listbox),
    ],
  ])(
    'commits the row %s leaves it on when it takes the wheel during a key step',
    (_name, take, leave) => {
      vi.useFakeTimers();
      const {listbox, onChange, frame, wait} = renderStepped(10);
      fireEvent.keyDown(listbox, {key: 'ArrowDown'});
      frame(10 * ROW + 6);
      take(listbox);
      frame(12 * ROW);
      frame(13 * ROW);
      leave(listbox);
      // A person's scroll still rests after the quiet period.
      wait(SCROLL_QUIET_MS + 10);
      expect(onChange).toHaveBeenLastCalledWith(13);
    },
  );
});

describe('Wheel — by pointer', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * The pointer and the engine: `(pointer: coarse)` is a finger, and
   * `-webkit-touch-callout` exists only in WebKit on iOS, which must not
   * matter.
   */
  function stubDevice({ios, coarse}: {ios: boolean; coarse: boolean}) {
    vi.stubGlobal('CSS', {
      supports: (condition: string) =>
        ios && condition.includes('-webkit-touch-callout'),
    });
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query === '(pointer: coarse)' && coarse,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      })),
    );
  }

  function renderPicker() {
    const ref = createRef<WheelHandle>();
    const onChange = vi.fn();
    const view = render(
      <Wheel
        ref={ref}
        label="Hour"
        options={HOURS}
        value={12}
        onChange={onChange}
      />,
    );
    return {...view, ref, onChange};
  }

  it.each([
    ['iOS WebKit', true],
    ['Android Chrome', false],
  ])('draws the touch column under a finger, on %s', (_, ios) => {
    stubDevice({ios, coarse: true});
    const {container} = renderPicker();
    expect(container.querySelector('[data-wheel]')).not.toBeNull();
    // Each option is a drawn row, once.
    expect(container.querySelectorAll('[data-wheel-row]')).toHaveLength(
      HOURS.length,
    );
  });

  it.each([
    ['a mouse', false],
    ['iOS WebKit with a mouse', true],
  ])('keeps the scrolling column, with no frame, for %s', (_, ios) => {
    stubDevice({ios, coarse: false});
    const {container} = renderPicker();
    expect(container.querySelector('[data-wheel]')).toBeNull();
    // Today's column, straight in its container: no group frame around it.
    expect(
      screen.getByRole('listbox', {name: 'Hour'}).parentElement?.parentElement,
    ).toBe(container);
  });

  it('commits a spin at once under a fine pointer', async () => {
    stubDevice({ios: false, coarse: false});
    expect(window.matchMedia('(pointer: coarse)').matches).toBe(false);
    const {ref, onChange} = renderPicker();
    await expect(ref.current?.spinTo(14)).resolves.toBe(true);
    expect(onChange).toHaveBeenCalledWith(14);
    // A disabled row is not a place to rest.
    await expect(ref.current?.spinTo(3)).resolves.toBe(false);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe('Wheel — markup', () => {
  // Written before the listbox wiring moved into useWheelListbox: the
  // snapshot holds today's column to its markup (attributes, classes, order).
  it('keeps today’s column’s markup', () => {
    const {container} = render(
      <Wheel label="Hour" options={HOURS} value={10} onChange={() => {}} />,
    );
    // React's generated ids depend on how many renders ran before.
    expect(
      container.innerHTML.replace(/_r_[0-9a-z]+_/g, '_r_id_'),
    ).toMatchSnapshot();
  });
});
