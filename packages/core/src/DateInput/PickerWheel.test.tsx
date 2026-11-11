// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PickerWheel.test.tsx
 * @input Uses Vitest, Testing Library, the touch picker column and touch events
 *   dispatched through the gesture system with a fake clock
 * @output Proves what a wheel commits and when: a drag, a release onto a row,
 *   past the bounds, a fling, a tap, a finger catching a moving wheel, the
 *   keyboard, a click, a programmatic spin, a custom rest rule
 * @position Unit coverage for PickerWheel.tsx (the Wheel under a finger;
 *   Wheel.test.tsx covers the switch and today's column); the curves themselves are proven in
 *   wheelPhysics.test.ts, the strip's motion in wheelStrip.test.ts, and on
 *   screen by the browser specs
 */

import {act, fireEvent, render, screen} from '@testing-library/react';
import {Profiler, createRef, useRef, useState} from 'react';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {springs, timing} from '../motion/uikit';
import {fontWeightVars} from '../theme/tokens.stylex';
import {PickerWheel} from './PickerWheel';
import {bounceCurve, scaleFor} from './wheelPhysics';
import {
  WHEEL_ROW_HEIGHT,
  type WheelHandle,
  type WheelOption,
  type WheelProps,
} from './wheelOptions';

const ROW = WHEEL_ROW_HEIGHT;
/** The column is laid out 216 px tall, its band's centre 108 px down. */
const CENTRE = 108;

/**
 * How long a turn of `rows` rows from rest lasts on `springs.settle`, in ms.
 * A tap, a key or the program starts that motion.
 */
function turnMs(rows: number): number {
  return (
    bounceCurve(0, 0, rows * ROW, scaleFor(ROW), springs.settle).duration * 1000
  );
}

/** Hours 0-23 with 09:00-17:00 bounds: 0-8 and 18-23 are disabled. */
const HOURS: WheelOption[] = Array.from({length: 24}, (_, hour) => ({
  value: hour,
  label: String(hour).padStart(2, '0'),
  isDisabled: hour < 9 || hour > 17,
}));

const MINUTES: WheelOption[] = Array.from({length: 60}, (_, minute) => ({
  value: minute,
  label: String(minute).padStart(2, '0'),
}));

// One fake clock serves the whole file. The gesture system is one per document
// and keeps its own timeline, so time must never run backwards between tests.
beforeAll(() => {
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'performance',
      'Date',
      'requestAnimationFrame',
      'cancelAnimationFrame',
    ],
  });
});

// The touch column draws only where the primary pointer is coarse, and only
// there does the gesture host take input (spec:AST-094 FR19). Every case runs
// under a coarse primary pointer, as on a phone or a tablet.
beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(pointer: coarse)',
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

afterEach(() => {
  // Let every motion and gesture timer of the test run out.
  vi.advanceTimersByTime(10_000);
  vi.unstubAllGlobals();
});

afterAll(() => {
  vi.useRealTimers();
});

/** A wheel whose owner commits each change, as a field does. */
function OwnedWheel({
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
    <PickerWheel
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

function renderOwnedWheel(options: WheelOption[], initial: number) {
  const onChange = vi.fn();
  render(
    <OwnedWheel options={options} initial={initial} onChange={onChange} />,
  );
  return {column: screen.getByRole('listbox', {name: 'Hour'}), onChange};
}

function renderWheel(props: Partial<WheelProps> = {}) {
  const onChange = vi.fn();
  const view = render(
    <PickerWheel
      label="Hour"
      options={HOURS}
      value={10}
      onChange={onChange}
      {...props}
    />,
  );
  const column = screen.getByRole('listbox', {name: props.label ?? 'Hour'});
  column.getBoundingClientRect = () => ({
    top: 0,
    bottom: 216,
    left: 0,
    right: 120,
    width: 120,
    height: 216,
    x: 0,
    y: 0,
    toJSON() {},
  });
  const option = (label: string): HTMLElement =>
    screen.getByRole('option', {name: label});
  return {...view, onChange, column, option};
}

/** Each finger gets its own identifier, as a new contact does. */
let nextFinger = 1;
let finger = 0;

/** One touch event at the fake clock's time. */
function touch(
  type: 'touchstart' | 'touchmove' | 'touchend',
  target: Element,
  y: number,
) {
  if (type === 'touchstart') {
    finger = nextFinger++;
  }
  const event = new Event(type, {bubbles: true, cancelable: true});
  const entry = {identifier: finger, clientX: 60, clientY: y, target};
  Object.defineProperty(event, 'changedTouches', {value: [entry]});
  Object.defineProperty(event, 'touches', {
    value: type === 'touchend' ? [] : [entry],
  });
  Object.defineProperty(event, 'timeStamp', {value: performance.now()});
  act(() => {
    target.dispatchEvent(event);
  });
}

/**
 * A finger that lands at `from`, moves to `to` in `steps` events `interval`
 * ms apart, optionally holds still, and lifts.
 */
function drag(
  target: Element,
  from: number,
  to: number,
  {steps = 10, interval = 16, hold = 0} = {},
) {
  touch('touchstart', target, from);
  for (let i = 1; i <= steps; i++) {
    act(() => {
      vi.advanceTimersByTime(interval);
    });
    touch('touchmove', target, from + ((to - from) * i) / steps);
  }
  if (hold > 0) {
    act(() => {
      vi.advanceTimersByTime(hold);
    });
  }
  touch('touchend', target, to);
}

/**
 * Advances the clock with the promise callbacks between its timers run: the
 * animator dates a Reduce Motion landing from its start promise.
 */
async function advanceAsync(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

/**
 * How far below the band's centre a row is drawn: its place along the
 * strip, and the strip's translation (the `translate` the animator writes).
 */
function distanceOf(element: Element): number {
  const row = element as HTMLElement;
  const strip = row.parentElement!;
  const index = Array.prototype.indexOf.call(strip.children, row);
  const [, y = '0'] = strip.style
    .getPropertyValue('translate')
    .trim()
    .split(/\s+/);
  return index * ROW + (Number.parseFloat(y) || 0);
}

describe('PickerWheel — at rest', () => {
  it('is a listbox with one option per row, each label once', () => {
    const {column} = renderWheel();
    expect(screen.getAllByRole('option')).toHaveLength(24);
    // Each option is drawn once, as its own row.
    expect(screen.getAllByText('10')).toHaveLength(1);
    expect(column).toHaveAttribute('tabindex', '0');
  });

  it('parks the committed row under the band, the others above and below it', () => {
    const {option, column} = renderWheel();
    expect(distanceOf(option('10'))).toBeCloseTo(0, 4);
    expect(distanceOf(option('11'))).toBeCloseTo(ROW, 2);
    expect(distanceOf(option('09'))).toBeCloseTo(-ROW, 2);
    expect(column.getAttribute('aria-activedescendant')).toBe(option('10').id);
  });

  it('points the active row at a value set from outside in the same commit', () => {
    // One entry per commit: the active descendant the listbox shows then.
    const commits: (string | null)[] = [];
    const onRender = () => {
      commits.push(
        screen
          .getByRole('listbox', {name: 'Hour'})
          .getAttribute('aria-activedescendant'),
      );
    };
    const wheel = (value: number) => (
      <Profiler id="wheel" onRender={onRender}>
        <PickerWheel
          label="Hour"
          options={HOURS}
          value={value}
          onChange={() => {}}
        />
      </Profiler>
    );
    const {rerender} = render(wheel(10));
    commits.length = 0;
    rerender(wheel(12));
    expect(commits).toEqual([screen.getByRole('option', {name: '12'}).id]);
  });

  describe('a value changed from outside while it is shown', () => {
    /** The strip's place along each frame of every animation it was given. */
    let strips: number[][];

    beforeEach(() => {
      strips = [];
      // jsdom runs no Web Animations: record what the wheel asks of its strip.
      Element.prototype.animate = vi.fn(function animate(
        this: Element,
        keyframes: Keyframe[],
      ) {
        if (this.hasAttribute('data-wheel-strip')) {
          strips.push(
            keyframes.map(frame => {
              const [, y = '0'] = String(frame.translate ?? '')
                .trim()
                .split(/\s+/);
              return Number.parseFloat(y) || 0;
            }),
          );
        }
        return {cancel: () => {}} as unknown as Animation;
      });
    });

    afterEach(() => {
      Reflect.deleteProperty(Element.prototype, 'animate');
    });

    it('turns the wheel onto its row, as a bound clamping the time (component:DateInput FR14)', () => {
      const {rerender, option, onChange} = renderWheel();
      advance(2000);
      strips.length = 0;
      rerender(
        <PickerWheel
          label="Hour"
          options={HOURS}
          value={14}
          onChange={onChange}
        />,
      );
      // From 10 onto 14 through the rows between: a turn, never a jump.
      expect(strips).toHaveLength(1);
      const [turn] = strips;
      expect(turn[0]).toBeCloseTo(-10 * ROW, 1);
      expect(turn[turn.length - 1]).toBeCloseTo(-14 * ROW, 1);
      expect(
        turn.filter(y => y < -10 * ROW - 1 && y > -14 * ROW + 1).length,
      ).toBeGreaterThanOrEqual(4);
      advance(2000);
      expect(distanceOf(option('14'))).toBeCloseTo(0, 1);
      expect(isMarked(option('14'))).toBe(true);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('turns on from where the wheel is drawn when the value changes again during that turn', () => {
      const {rerender, option, onChange} = renderWheel();
      advance(2000);
      const wheel = (value: number) => (
        <PickerWheel
          label="Hour"
          options={HOURS}
          value={value}
          onChange={onChange}
        />
      );
      strips.length = 0;
      rerender(wheel(14));
      advance(Math.round(turnMs(4) / 2));
      rerender(wheel(16));
      expect(strips).toHaveLength(2);
      const [, second] = strips;
      // The second turn starts between 10 and 14, where the first has it
      // drawn, and ends on 16.
      expect(second[0]).toBeLessThan(-10 * ROW - 1);
      expect(second[0]).toBeGreaterThan(-14 * ROW + 1);
      expect(second[second.length - 1]).toBeCloseTo(-16 * ROW, 1);
      advance(2000);
      expect(distanceOf(option('16'))).toBeCloseTo(0, 1);
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  it('opening on a value outside the bounds commits nothing', () => {
    const {onChange, column, option} = renderWheel({value: 8});
    advance(2000);
    expect(onChange).not.toHaveBeenCalled();
    expect(column.getAttribute('aria-activedescendant')).toBe(option('08').id);
  });

  it('rests back on a committed value outside the bounds and commits nothing', () => {
    // component:DateInput FR13: a wheel resting on its committed row commits
    // nothing, even outside the bounds, as the scrolling column keeps it.
    const {column, option, onChange} = renderWheel({value: 8});
    advance(2000);
    // One gesture: up a row onto 09 (enabled), back down onto 08, held
    // still, lifted.
    const away = 10 + ROW;
    touch('touchstart', column, 100);
    for (let i = 1; i <= 15; i++) {
      advance(40);
      touch('touchmove', column, 100 - (away * i) / 15);
    }
    for (let i = 1; i <= 15; i++) {
      advance(40);
      touch('touchmove', column, 100 - away + (away * i) / 15);
    }
    advance(300);
    touch('touchend', column, 100);
    advance(2000);
    expect(onChange).not.toHaveBeenCalled();
    expect(distanceOf(option('08'))).toBeCloseTo(0, 4);
    // Back on the row it left, the band's mark is back on it too.
    expect(isMarked(option('08'))).toBe(true);
  });

  it('parks a value set while it is hidden at once when it is shown again', () => {
    const {rerender, option, onChange} = renderWheel();
    const wheel = (value: number, isActive: boolean) => (
      <PickerWheel
        label="Hour"
        options={HOURS}
        value={value}
        onChange={onChange}
        isActive={isActive}
      />
    );
    rerender(wheel(10, false));
    rerender(wheel(14, false));
    rerender(wheel(14, true));
    expect(distanceOf(option('14'))).toBeCloseTo(0, 4);
  });
});

/** Whether a row carries the band's mark: painted, or styled in render and not overridden. */
function isMarked(row: HTMLElement): boolean {
  if (row.style.fontWeight !== '') {
    return row.style.fontWeight === fontWeightVars['--font-weight-semibold'];
  }
  return row.className.includes('rowActive');
}

describe('PickerWheel — a finger', () => {
  it('turns text selection off while a finger holds it (spec:AST-094 FR41)', () => {
    // A held finger turns the wheel, so its pan takes the selection lock.
    // Outside iOS WebKit (jsdom here) the lock refuses a selection that
    // starts under the finger by cancelling `selectstart`, and writes no
    // style.
    const {column, option} = renderWheel();
    const refuses = () => {
      const event = new Event('selectstart', {bubbles: true, cancelable: true});
      option('10').dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(refuses()).toBe(false);
    touch('touchstart', column, CENTRE);
    expect(refuses()).toBe(true);
    expect(column.style.getPropertyValue('user-select')).toBe('');
    advance(300);
    touch('touchend', column, CENTRE);
    expect(refuses()).toBe(false);
  });

  it('marks no row while a fling coasts, then the row it rests on', () => {
    const {column, onChange} = renderWheel({
      options: MINUTES,
      value: 10,
      label: 'Minute',
    });
    const marked = () =>
      screen
        .getAllByRole('option')
        .filter(isMarked)
        .map(row => row.textContent);
    expect(marked()).toEqual(['10']);
    drag(column, 180, 60, {steps: 6, interval: 16});
    // The coast plays (jsdom shows its end inline, but no row is marked).
    expect(marked()).toEqual([]);
    advance(4000);
    expect(onChange).toHaveBeenCalledTimes(1);
    const rested = String(onChange.mock.calls[0][0]).padStart(2, '0');
    expect(marked()).toEqual([rested]);
  });

  it('marks no row while the wheel snaps or turns, then the row it rests on', () => {
    const {column} = renderWheel();
    const marked = () =>
      screen
        .getAllByRole('option')
        .filter(isMarked)
        .map(row => row.textContent);
    // A slow release snaps onto 11.
    drag(column, 150, 100, {steps: 25, interval: 40, hold: 300});
    expect(marked()).toEqual([]);
    advance(1000);
    expect(marked()).toEqual(['11']);
    // A key turns the wheel on to 12.
    fireEvent.keyDown(column, {key: 'ArrowDown'});
    expect(marked()).toEqual([]);
    advance(1000);
    expect(marked()).toEqual(['12']);
  });

  it('drags the rows with it, without committing until the wheel rests', () => {
    const {column, option, onChange} = renderWheel();
    touch('touchstart', column, 150);
    for (let i = 1; i <= 8; i++) {
      advance(16);
      touch('touchmove', column, 150 - i * 6);
    }
    // 48 px of travel, 10 of it the pan's hysteresis: 38 px up.
    expect(distanceOf(option('10'))).toBeCloseTo(-38, 1);
    expect(onChange).not.toHaveBeenCalled();
    touch('touchend', column, 102);
    advance(2000);
  });

  it('eases onto the nearest row after a slow release and commits it there', () => {
    const {column, onChange} = renderWheel();
    // 10 px of hysteresis + 40 px: 1.25 rows, held still, lifted.
    drag(column, 150, 100, {steps: 25, interval: 40, hold: 300});
    expect(onChange).not.toHaveBeenCalled();
    advance(1000);
    expect(onChange).toHaveBeenCalledWith(11);
  });

  it('keeps the band’s mark on the committed row after a nudge that eases back onto it', () => {
    const {column, option, onChange} = renderWheel();
    expect(isMarked(option('10'))).toBe(true);
    // 10 px of hysteresis + a third of a row, held still, lifted.
    drag(column, 150, 150 - (10 + ROW / 3), {
      steps: 10,
      interval: 40,
      hold: 300,
    });
    advance(2000);
    expect(onChange).not.toHaveBeenCalled();
    expect(distanceOf(option('10'))).toBeCloseTo(0, 4);
    expect(isMarked(option('10'))).toBe(true);
  });

  it('turns on to the minimum after resting below it, and commits that', () => {
    const {column, option, onChange} = renderWheel();
    // Down 3 rows (+10 px of hysteresis): the wheel rests on 07, disabled.
    drag(column, 60, 60 + 10 + 3 * ROW, {steps: 30, interval: 40, hold: 300});
    advance(100);
    expect(onChange).not.toHaveBeenCalled();
    advance(2000);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(9);
    expect(distanceOf(option('09'))).toBeCloseTo(0, 4);
  });

  it('flings across several rows before committing', () => {
    const {column, onChange} = renderWheel({
      options: MINUTES,
      value: 10,
      label: 'Minute',
    });
    drag(column, 180, 60, {steps: 6, interval: 16});
    advance(200);
    expect(onChange).not.toHaveBeenCalled();
    advance(4000);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toBeGreaterThan(15);
  });

  it('rubber-bands past the last row and returns to it', () => {
    const {column, option, onChange} = renderWheel({value: 17});
    // Up far past hour 23.
    drag(column, 200, 20, {steps: 30, interval: 30, hold: 300});
    // Past the end, the last row has moved above the band by less than the
    // finger travelled.
    advance(3000);
    // It rests on 23 (disabled), then turns back onto 17.
    advance(2000);
    expect(onChange).not.toHaveBeenCalledWith(23);
    expect(distanceOf(option('17'))).toBeCloseTo(0, 4);
  });

  it('is held where it shows by a finger that catches it in its rubber band, then follows that finger (spec:AST-094 FR6)', () => {
    const {column, option} = renderWheel({
      options: MINUTES,
      value: 59,
      label: 'Minute',
    });
    /** The wheel's offset, from where its last row is drawn. */
    const offsetOf = () => 59 * ROW - distanceOf(option('59'));
    // Up past the last row (10 px of hysteresis and 180 more), held, lifted:
    // the wheel starts back out of its rubber band.
    drag(column, 200, 10, {steps: 30, interval: 30, hold: 300});
    // A finger lands while the return is still far out: the wheel stops
    // there, drawn where it was.
    advance(16);
    touch('touchstart', column, 150);
    advance(16);
    const caught = offsetOf();
    expect(caught - 59 * ROW).toBeGreaterThan(40);
    // The hysteresis, then 6 px more up: the band gives a little of it, never
    // a jump.
    touch('touchmove', column, 140);
    advance(16);
    touch('touchmove', column, 134);
    advance(16);
    const moved = offsetOf() - caught;
    expect(moved).toBeGreaterThan(0.5);
    expect(moved).toBeLessThan(6);
    touch('touchend', column, 134);
    advance(2000);
  });

  it('is stopped where it is by a finger that lands on it, and commits nothing', () => {
    const {column, option, onChange} = renderWheel({
      options: MINUTES,
      value: 10,
      label: 'Minute',
    });
    drag(column, 180, 60, {steps: 6, interval: 16});
    advance(150);
    // jsdom runs no animations: a motion shows its end inline.
    const heading = distanceOf(option('10'));
    touch('touchstart', column, 100);
    const caught = distanceOf(option('10'));
    // Stopped where it was on screen, well short of where it was heading,
    // and held there.
    expect(Math.abs(caught - heading)).toBeGreaterThan(ROW);
    advance(50);
    expect(Math.abs(distanceOf(option('10')) - caught)).toBeLessThan(1);
    touch('touchend', column, 100);
    // A catch is not a tap: no turn onto the touched row, only the snap.
    advance(1000);
    expect(onChange).toHaveBeenCalledTimes(1);
    const rested = onChange.mock.calls[0][0] as number;
    expect(Math.abs(distanceOf(option(String(rested).padStart(2, '0'))))).toBe(
      0,
    );
  });

  it('turns onto a tapped row and commits it on arrival', () => {
    const {column, onChange} = renderWheel();
    const below = CENTRE + ROW;
    touch('touchstart', column, below);
    advance(60);
    touch('touchend', column, below);
    expect(onChange).not.toHaveBeenCalled();
    advance(turnMs(1) + 10);
    expect(onChange).toHaveBeenCalledWith(11);
  });

  it('a finger’s tap turns once: its lift is cancelled, so the browser sends no click', () => {
    // spec:AST-094 FR19: the tap recognizer owns a finger's tap, and the
    // row's click handler is left to keys, assistive technology and a mouse.
    const {column, onChange} = renderWheel();
    const below = CENTRE + ROW;
    touch('touchstart', column, below);
    advance(60);
    const lift = new Event('touchend', {bubbles: true, cancelable: true});
    const entry = {
      identifier: finger,
      clientX: 60,
      clientY: below,
      target: column,
    };
    Object.defineProperty(lift, 'changedTouches', {value: [entry]});
    Object.defineProperty(lift, 'touches', {value: []});
    Object.defineProperty(lift, 'timeStamp', {value: performance.now()});
    act(() => {
      column.dispatchEvent(lift);
    });
    expect(lift.defaultPrevented).toBe(true);
    advance(turnMs(1) + 10);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(11);
  });

  it('does nothing for a tap on the band’s row', () => {
    const {column, onChange} = renderWheel();
    touch('touchstart', column, CENTRE);
    advance(60);
    touch('touchend', column, CENTRE);
    advance(500);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('drops a drag it is hidden in, and parks the committed row when shown again', () => {
    const {column, onChange, option, rerender} = renderWheel();
    const props = {label: 'Hour', options: HOURS, value: 10, onChange};
    // A finger drags the rows two rows up; the wheel is hidden before it lifts.
    touch('touchstart', column, 150);
    for (let i = 1; i <= 6; i++) {
      advance(16);
      touch('touchmove', column, 150 - 12 * i);
    }
    expect(distanceOf(option('10'))).not.toBeCloseTo(0, 2);
    rerender(<PickerWheel {...props} isActive={false} />);
    touch('touchend', column, 78);
    advance(1000);
    rerender(<PickerWheel {...props} isActive />);
    advance(100);
    expect(onChange).not.toHaveBeenCalled();
    expect(distanceOf(option('10'))).toBeCloseTo(0, 4);
  });

  it('ignores fingers while hidden', () => {
    const {column, option, onChange} = renderWheel({isActive: false});
    const before = option('10').style.transform;
    drag(column, 150, 60, {steps: 10, interval: 16});
    advance(3000);
    expect(onChange).not.toHaveBeenCalled();
    expect(option('10').style.transform).toBe(before);
  });
});

describe('PickerWheel — keyboard and clicks', () => {
  it('commits each arrow key at once, stepping from the row it is heading to', () => {
    const {column, onChange} = renderWheel();
    fireEvent.keyDown(column, {key: 'ArrowDown'});
    expect(onChange).toHaveBeenLastCalledWith(11);
    fireEvent.keyDown(column, {key: 'ArrowDown'});
    expect(onChange).toHaveBeenLastCalledWith(12);
  });

  it('skips disabled rows and stops at the bounds', () => {
    const {column, onChange} = renderWheel({value: 9});
    fireEvent.keyDown(column, {key: 'ArrowUp'});
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(column, {key: 'End'});
    expect(onChange).toHaveBeenLastCalledWith(17);
  });

  it('at a 12:00–17:00 bound, moves a key to the next enabled row and stops at the last one', () => {
    const bound = HOURS.map(option => ({
      ...option,
      isDisabled: option.value < 12 || option.value > 17,
    }));
    const {column, onChange} = renderOwnedWheel(bound, 17);
    // No enabled row lies below 17: these keys commit nothing.
    for (const key of ['ArrowDown', 'PageDown', 'End']) {
      fireEvent.keyDown(column, {key});
    }
    expect(onChange).not.toHaveBeenCalled();
    // PageUp's target, 7, is past the bound: the key stops at 12.
    fireEvent.keyDown(column, {key: 'PageUp'});
    expect(onChange).toHaveBeenLastCalledWith(12);
    fireEvent.keyDown(column, {key: 'ArrowUp'});
    fireEvent.keyDown(column, {key: 'Home'});
    expect(onChange).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(column, {key: 'End'});
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
    const {column, onChange} = renderOwnedWheel(pmHours, 5);
    for (const key of ['ArrowDown', 'PageDown', 'End']) {
      fireEvent.keyDown(column, {key});
    }
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(column, {key: 'Home'});
    expect(onChange).toHaveBeenLastCalledWith(12);
    fireEvent.keyDown(column, {key: 'ArrowDown'});
    expect(onChange).toHaveBeenLastCalledWith(1);
    fireEvent.keyDown(column, {key: 'ArrowUp'});
    expect(onChange).toHaveBeenLastCalledWith(12);
  });

  it('lets a turn onto the last allowed row finish when a key during it has nowhere to go', () => {
    const bound = HOURS.map(option => ({
      ...option,
      isDisabled: option.value < 12 || option.value > 17,
    }));
    const {column, onChange} = renderOwnedWheel(bound, 16);
    fireEvent.keyDown(column, {key: 'ArrowDown'});
    expect(onChange).toHaveBeenLastCalledWith(17);
    // Mid-turn, a second ArrowDown finds no allowed row past 17.
    advance(100);
    fireEvent.keyDown(column, {key: 'ArrowDown'});
    advance(1000);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(distanceOf(screen.getByRole('option', {name: '17'}))).toBeCloseTo(
      0,
      4,
    );
  });

  it('moves a key from a row outside the bounds onto the first enabled row in its direction', () => {
    const bound = HOURS.map(option => ({
      ...option,
      isDisabled: option.value < 12 || option.value > 17,
    }));
    const {column, onChange} = renderOwnedWheel(bound, 20);
    fireEvent.keyDown(column, {key: 'ArrowDown'});
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(column, {key: 'ArrowUp'});
    expect(onChange).toHaveBeenLastCalledWith(17);
  });

  it('keeps the band’s mark on the last row when a key has nowhere further to go', () => {
    const {column, option, onChange} = renderWheel({
      options: MINUTES,
      value: 59,
      label: 'Minute',
    });
    fireEvent.keyDown(column, {key: 'ArrowDown'});
    advance(1000);
    expect(onChange).not.toHaveBeenCalled();
    expect(distanceOf(option('59'))).toBeCloseTo(0, 4);
    expect(isMarked(option('59'))).toBe(true);
  });

  it('takes Home and End to the first and last enabled rows, even mid-coast', () => {
    const {column, onChange} = renderWheel({
      options: MINUTES,
      value: 10,
      label: 'Minute',
    });
    drag(column, 180, 60, {steps: 6, interval: 16});
    advance(200);
    // Still coasting, towards a row well past 10.
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(column, {key: 'Home'});
    expect(onChange).toHaveBeenLastCalledWith(0);
    fireEvent.keyDown(column, {key: 'End'});
    expect(onChange).toHaveBeenLastCalledWith(59);
  });

  it('commits a clicked row at once and never a disabled one', () => {
    const {option, onChange} = renderWheel();
    fireEvent.click(option('07'));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(option('13'));
    expect(onChange).toHaveBeenCalledWith(13);
  });
});

describe('PickerWheel — a mouse', () => {
  /** One mouse pointer event at the fake clock's time. */
  function mouse(
    type: 'pointerdown' | 'pointermove' | 'pointerup',
    target: Element,
    y: number,
    {button = 0, buttons = 1}: {button?: number; buttons?: number} = {},
  ) {
    const event = new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 41,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: 60,
      clientY: y,
      button,
      buttons,
    });
    Object.defineProperty(event, 'timeStamp', {value: performance.now()});
    act(() => {
      target.dispatchEvent(event);
    });
  }

  /**
   * A slow drag up by `distance` px with `button` held, then a release. The
   * drag stays well under the release velocity floor, so the wheel rests where
   * it is let go.
   */
  function mouseDrag(target: Element, distance: number, button = 0) {
    const buttons = button === 0 ? 1 : 2;
    mouse('pointerdown', target, 150, {button, buttons});
    for (let i = 1; i <= 25; i++) {
      advance(40);
      mouse('pointermove', target, 150 - (distance * i) / 25, {
        button: -1,
        buttons,
      });
    }
    advance(300);
    mouse('pointerup', target, 150 - distance, {button, buttons: 0});
  }

  it('turns with a primary-button drag and commits where it rests', () => {
    // A mouse on a touch device (a tablet's trackpad): the primary pointer
    // stays coarse.
    expect(window.matchMedia('(pointer: coarse)').matches).toBe(true);
    const {column, onChange} = renderWheel();
    // 10 px of hysteresis + 40 px: 1.25 rows.
    mouseDrag(column, 50);
    advance(1000);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(11);
  });

  it('does nothing for a secondary-button drag', () => {
    // A mouse on a touch device (a tablet's trackpad): the primary pointer
    // stays coarse.
    expect(window.matchMedia('(pointer: coarse)').matches).toBe(true);
    const {column, onChange} = renderWheel();
    mouseDrag(column, 50, 2);
    advance(2000);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('PickerWheel — a scroll wheel and a trackpad', () => {
  /**
   * One wheel event over the column at the fake clock's time; returns whether
   * it was cancelled. `legacy` is the `wheelDeltaX`/`wheelDeltaY` that Chromium
   * and WebKit send. A mouse wheel's notch is 120 a step, and a trackpad's
   * precise delta is three times its own. The gesture host reads which it is.
   */
  function wheel(
    target: Element,
    init: {
      dx?: number;
      dy?: number;
      mode?: number;
      ctrl?: boolean;
      legacy?: {x: number; y: number};
    },
  ): boolean {
    const event = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: 60,
      clientY: CENTRE,
      deltaX: init.dx ?? 0,
      deltaY: init.dy ?? 0,
      deltaMode: init.mode ?? 0,
      ctrlKey: init.ctrl ?? false,
    });
    Object.defineProperty(event, 'timeStamp', {value: performance.now()});
    if (init.legacy != null) {
      Object.defineProperty(event, 'wheelDeltaX', {value: init.legacy.x});
      Object.defineProperty(event, 'wheelDeltaY', {value: init.legacy.y});
    }
    act(() => {
      target.dispatchEvent(event);
    });
    return event.defaultPrevented;
  }
  /** A mouse wheel's notch down, as Chromium sends one. */
  const notch = (target: Element) =>
    wheel(target, {dy: 100, legacy: {x: 0, y: -120}});
  /** A trackpad's precise delta down, as Chromium and WebKit send one. */
  const trackpad = (target: Element, dy: number) =>
    wheel(target, {dy, legacy: {x: 0, y: -3 * dy}});

  it('turns one row for a mouse wheel’s notch, as an arrow key does, with no coast (component:DateInput FR15)', () => {
    const {column, option, onChange} = renderWheel();
    expect(notch(column)).toBe(true);
    // As an arrow key: the next row commits at once.
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(11);
    advance(2000);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(distanceOf(option('11'))).toBeCloseTo(0, 1);
  });

  it('turns three rows for three notches, one each', () => {
    const {column, option, onChange} = renderWheel();
    for (let i = 0; i < 3; i++) {
      expect(notch(column)).toBe(true);
      advance(40);
    }
    expect(onChange.mock.calls).toEqual([[11], [12], [13]]);
    advance(2000);
    expect(distanceOf(option('13'))).toBeCloseTo(0, 1);
  });

  it('turns one row for a line-mode notch, as Firefox sends', () => {
    const {column, onChange} = renderWheel();
    expect(wheel(column, {dy: 3, mode: 1})).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(11);
  });

  it('leaves a ctrl-wheel, a trackpad pinch, to the page (spec:AST-094 FR10, FR43)', () => {
    const {column, onChange} = renderWheel();
    expect(wheel(column, {dy: 100, ctrl: true, legacy: {x: 0, y: -120}})).toBe(
      false,
    );
    advance(1000);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('leaves a sideways scroll to the page', () => {
    const {column, onChange} = renderWheel();
    expect(wheel(column, {dx: 100, legacy: {x: -120, y: 0}})).toBe(false);
    advance(1000);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('follows a trackpad’s fingers, coasts on at their lift and rests on a row, as a finger’s flick does (component:DateInput FR15)', () => {
    const {column, option, onChange} = renderWheel({
      options: MINUTES,
      value: 10,
      label: 'Minute',
    });
    /** The wheel's offset, from where minute 10 is drawn. */
    const offsetOf = () => 10 * ROW - distanceOf(option('10'));
    // The fingers: 12 px a frame for 12 frames.
    for (let i = 0; i < 12; i++) {
      expect(trackpad(column, 12)).toBe(true);
      advance(16);
    }
    const atLift = offsetOf();
    // The rows followed the fingers' travel.
    expect(atLift).toBeGreaterThan(10 * ROW + 60);
    expect(onChange).not.toHaveBeenCalled();
    // The momentum the platform sends after the lift: a shrinking run.
    for (const dy of [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]) {
      trackpad(column, dy);
      advance(16);
    }
    advance(3000);
    // It coasted on past the fingers' travel at UIKit's deceleration, much
    // farther than the platform's momentum. That momentum (66 px) never moves
    // it. It rests on a row there, committed once.
    expect(onChange).toHaveBeenCalledTimes(1);
    const [[rested]] = onChange.mock.calls as [[number]];
    expect(rested * ROW - atLift).toBeGreaterThan(5 * ROW);
    expect(distanceOf(option(String(rested).padStart(2, '0')))).toBeCloseTo(
      0,
      1,
    );
  });

  it('rests on the nearest row after a slow trackpad drag that stops, without coasting', () => {
    const {column, option, onChange} = renderWheel({
      options: MINUTES,
      value: 10,
      label: 'Minute',
    });
    const offsetOf = () => 10 * ROW - distanceOf(option('10'));
    // 2 px a frame for 20 frames, then the fingers stop on the pad.
    for (let i = 0; i < 20; i++) {
      trackpad(column, 2);
      advance(16);
    }
    const stopped = offsetOf();
    advance(3000);
    expect(onChange).toHaveBeenCalledTimes(1);
    const [[rested]] = onChange.mock.calls as [[number]];
    expect(Math.abs(rested * ROW - stopped)).toBeLessThanOrEqual(ROW / 2 + 1);
  });
});

describe('PickerWheel — a turn that a tap, a key or the program starts', () => {
  /** Each animation the wheel asks of its strip: its places and their times. */
  let strips: {places: number[]; times: number[]}[];

  beforeEach(() => {
    strips = [];
    // jsdom runs no Web Animations: record what the wheel asks of its strip.
    Element.prototype.animate = vi.fn(function animate(
      this: Element,
      keyframes: Keyframe[],
      options?: KeyframeAnimationOptions,
    ) {
      if (this.hasAttribute('data-wheel-strip')) {
        const span = Number(options?.duration ?? 0);
        strips.push({
          places: keyframes.map(frame => {
            const [, y = '0'] = String(frame.translate ?? '')
              .trim()
              .split(/\s+/);
            return Number.parseFloat(y) || 0;
          }),
          times: keyframes.map(frame => (frame.offset ?? 0) * span),
        });
      }
      return {cancel: () => {}} as unknown as Animation;
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(Element.prototype, 'animate');
  });

  function tap(column: HTMLElement, y: number) {
    touch('touchstart', column, y);
    advance(60);
    touch('touchend', column, y);
  }

  /** The strip goes from `from` to `to` on `springs.settle`, from rest. */
  function expectSpring(
    strip: {places: number[]; times: number[]},
    from: number,
    to: number,
  ) {
    const spring = bounceCurve(from, 0, to, scaleFor(ROW), springs.settle);
    expect(strip.places[0]).toBeCloseTo(from, 1);
    let inside = 0;
    strip.times.forEach((t, i) => {
      // The strip draws whole pixels.
      expect(Math.abs(strip.places[i] - spring.value(t / 1000))).toBeLessThan(
        0.5,
      );
      if (t > 0 && t < spring.duration * 1000) {
        inside++;
      }
    });
    expect(inside).toBeGreaterThanOrEqual(4);
  }

  it('turns onto a tapped row on the settle spring, from rest, and commits it on arrival', () => {
    const {column, onChange} = renderWheel();
    tap(column, CENTRE + ROW);
    expect(strips).toHaveLength(1);
    expectSpring(strips[0], -10 * ROW, -11 * ROW);
    advance(turnMs(1) - 10);
    expect(onChange).not.toHaveBeenCalled();
    advance(20);
    expect(onChange).toHaveBeenCalledWith(11);
  });

  it('keeps the spring whatever the theme’s duration and easing tokens', () => {
    // The wheel’s main interaction is a gesture, so its turns spring
    // (spec:AST-094 FR45): the tokens of a tap-first motion do not time it.
    const {column} = renderWheel();
    column.style.setProperty('--duration-medium', '0ms');
    column.style.setProperty('--ease-move', 'linear');
    tap(column, CENTRE + ROW);
    expect(strips).toHaveLength(1);
    expectSpring(strips[0], -10 * ROW, -11 * ROW);
  });

  it('turns onto a value set from outside on the same spring (component:DateInput FR14)', () => {
    const {rerender, onChange} = renderWheel();
    advance(2000);
    strips.length = 0;
    rerender(
      <PickerWheel
        label="Hour"
        options={HOURS}
        value={14}
        onChange={onChange}
      />,
    );
    expect(strips).toHaveLength(1);
    expectSpring(strips[0], -10 * ROW, -14 * ROW);
  });

  it('turns onto a key’s row on the same spring', () => {
    const {column} = renderWheel();
    fireEvent.keyDown(column, {key: 'ArrowDown'});
    expect(strips).toHaveLength(1);
    expectSpring(strips[0], -10 * ROW, -11 * ROW);
  });

  it('keeps a fling’s measured coast', () => {
    const {column} = renderWheel({
      options: MINUTES,
      value: 10,
      label: 'Minute',
    });
    drag(column, 180, 60, {steps: 6, interval: 16});
    expect(strips.length).toBeGreaterThanOrEqual(1);
    const coast = strips[strips.length - 1];
    // A coast decelerates over seconds, far past the spring's turn.
    expect(coast.times.at(-1)).toBeGreaterThan(turnMs(15));
    advance(4000);
  });
});

describe('PickerWheel — under reduced motion', () => {
  const FADE_MS = timing.reducedMotionCrossFadeMs;
  /** Every animation the wheel started, with its keyframes and timing. */
  let animations: {keyframes: Keyframe[]; options: KeyframeAnimationOptions}[];

  beforeEach(() => {
    animations = [];
    vi.stubGlobal('matchMedia', (query: string) => ({
      // The touch column draws under a coarse primary pointer.
      matches:
        query === '(prefers-reduced-motion: reduce)' ||
        query === '(pointer: coarse)',
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    // jsdom runs no Web Animations: record what the wheel asks for.
    Element.prototype.animate = vi.fn(function animate(
      keyframes: Keyframe[],
      options: KeyframeAnimationOptions,
    ) {
      animations.push({keyframes, options});
      return {cancel: () => {}} as unknown as Animation;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(Element.prototype, 'animate');
  });

  /**
   * Nothing travels on the animator's Reduce Motion cross-fade
   * (design:reduced-motion DR2). The strip's opacity dips out over half the
   * fade, and its rows land on their row while it is transparent. No animation
   * moves the strip.
   */
  function expectFadesOnly() {
    expect(animations.length).toBeGreaterThan(0);
    for (const {keyframes} of animations) {
      const properties = new Set(
        keyframes.flatMap(frame =>
          Object.keys(frame).filter(
            key => key !== 'offset' && key !== 'easing',
          ),
        ),
      );
      expect([...properties]).toEqual(['opacity']);
    }
    const [dip] = animations;
    const out = dip.keyframes.find(frame => Number(frame.opacity) === 0);
    expect(out).toBeDefined();
    expect(Number(out?.offset) * Number(dip.options.duration)).toBeCloseTo(
      FADE_MS / 2,
      0,
    );
  }

  it('coasts a fling as momentum, its rows flat, then commits it', () => {
    // design:reduced-motion DR2: the momentum that continues a throw is
    // direct movement, not a transition, so it plays.
    const {column, onChange} = renderWheel({
      options: MINUTES,
      value: 10,
      label: 'Minute',
    });
    drag(column, 180, 60, {steps: 6, interval: 16});
    expect(animations.length).toBeGreaterThan(0);
    for (const {keyframes, options} of animations) {
      expect(options.duration).toBeGreaterThan(FADE_MS);
      // The strip travels, and nothing fades.
      expect(keyframes.some(frame => 'translate' in frame)).toBe(true);
      expect(keyframes.some(frame => 'opacity' in frame)).toBe(false);
    }
    expect(onChange).not.toHaveBeenCalled();
    advance(4000);
    expect(onChange).toHaveBeenCalledTimes(1);
    // The row the fling projects, as without the preference.
    expect(onChange.mock.calls[0][0]).toBeGreaterThan(15);
  });

  it('fades a slow release onto its row', () => {
    // A release that snaps is a transition the wheel starts: it cross-fades.
    const {column, onChange} = renderWheel();
    drag(column, 60, 60 + 10 + 1.4 * ROW, {steps: 20, interval: 40, hold: 300});
    expectFadesOnly();
    advance(FADE_MS);
    expect(onChange).toHaveBeenLastCalledWith(9);
  });

  it('fades for a spin', async () => {
    const ref = createRef<WheelHandle>();
    const {onChange} = renderWheel({ref});
    let arrived: boolean | undefined;
    act(() => {
      void ref.current!.spinTo(15).then(value => {
        arrived = value;
      });
    });
    await advanceAsync(FADE_MS);
    expect(arrived).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith(15);
    expectFadesOnly();
  });

  it('fades for a tap and a key', async () => {
    const {column, onChange} = renderWheel();
    const below = CENTRE + ROW;
    touch('touchstart', column, below);
    advance(60);
    touch('touchend', column, below);
    await advanceAsync(FADE_MS);
    expect(onChange).toHaveBeenLastCalledWith(11);
    // A key steps from the row the wheel rests on (the tap's 11).
    fireEvent.keyDown(column, {key: 'ArrowDown'});
    expect(onChange).toHaveBeenLastCalledWith(12);
    await advanceAsync(FADE_MS);
    expectFadesOnly();
  });
});

describe('PickerWheel — mechanics for its owners', () => {
  it('spins to a row on request and commits it there', async () => {
    const ref = createRef<WheelHandle>();
    const {onChange} = renderWheel({ref});
    let arrived: boolean | undefined;
    act(() => {
      void ref.current!.spinTo(15).then(value => {
        arrived = value;
      });
    });
    advance(turnMs(5) + 10);
    await act(async () => {});
    expect(arrived).toBe(true);
    expect(onChange).toHaveBeenCalledWith(15);
  });

  it('turns nothing and reports false for a spin onto a disabled row or outside the rows', async () => {
    // As the scrolling column answers.
    const ref = createRef<WheelHandle>();
    const {option, onChange} = renderWheel({ref});
    for (const index of [3, 24, -1]) {
      let arrived: boolean | undefined;
      act(() => {
        void ref.current!.spinTo(index).then(value => {
          arrived = value;
        });
      });
      await act(async () => {});
      expect(arrived, `spinTo(${index})`).toBe(false);
    }
    advance(1000);
    expect(onChange).not.toHaveBeenCalled();
    expect(distanceOf(option('10'))).toBeCloseTo(0, 4);
  });

  it('reports false for a spin still turning when the wheel goes away', async () => {
    const ref = createRef<WheelHandle>();
    const {unmount} = renderWheel({ref});
    const spin = ref.current!.spinTo(15);
    advance(100);
    unmount();
    await expect(spin).resolves.toBe(false);
  });

  it('reports a spin a finger interrupted', async () => {
    const ref = createRef<WheelHandle>();
    const {column} = renderWheel({ref});
    let arrived: boolean | undefined;
    act(() => {
      void ref.current!.spinTo(15).then(value => {
        arrived = value;
      });
    });
    advance(100);
    touch('touchstart', column, 100);
    await act(async () => {});
    expect(arrived).toBe(false);
  });

  it('keeps a spin going when its owner re-renders the rows mid-turn', async () => {
    const ref = createRef<WheelHandle>();
    const {rerender, onChange} = renderWheel({
      ref,
      options: MINUTES,
      value: 15,
      label: 'Minute',
    });
    let arrived: boolean | undefined;
    act(() => {
      void ref.current!.spinTo(30).then(value => {
        arrived = value;
      });
    });
    advance(100);
    // The owner commits a time on its bound: the minutes before 30 are
    // disabled now. The same row nodes come back, so the turn goes on.
    rerender(
      <PickerWheel
        ref={ref}
        label="Minute"
        options={MINUTES.map(option => ({
          ...option,
          isDisabled: option.value < 30,
        }))}
        value={30}
        onChange={onChange}
      />,
    );
    // Just past the turn's end: a turn the re-render started again would
    // still be running.
    advance(turnMs(15) - 100 + 10);
    await act(async () => {});
    expect(arrived).toBe(true);
  });
  it('keeps a finger that lands on it from an enclosing sheet', () => {
    // A sheet arms its pull-down on its body's pointerdown.
    const onPointerDown = vi.fn();
    const onChange = vi.fn();
    render(
      <div onPointerDown={onPointerDown}>
        <PickerWheel
          label="Minute"
          options={MINUTES}
          value={10}
          onChange={onChange}
        />
      </div>,
    );
    const column = screen.getByRole('listbox', {name: 'Minute'});
    fireEvent.pointerDown(column, {
      pointerId: 7,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
    });
    expect(onPointerDown).not.toHaveBeenCalled();
  });

  it('keeps coasting when its owner hands it a copy of the same rows', () => {
    const {column, rerender, onChange} = renderWheel({
      options: MINUTES,
      value: 10,
      label: 'Minute',
    });
    drag(column, 180, 60, {steps: 6, interval: 16});
    advance(200);
    rerender(
      <PickerWheel
        label="Minute"
        options={MINUTES.map(option => ({...option}))}
        value={10}
        onChange={onChange}
      />,
    );
    advance(4000);
    // It came to rest on a row and committed it, as without the re-render.
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toBeGreaterThan(15);
  });
});

/** A minute column every 15 minutes: a list shorter than the column. */
const QUARTERS: WheelOption[] = [0, 15, 30, 45].map(minute => ({
  value: minute,
  label: String(minute).padStart(2, '0'),
}));

/** A minute column every 20 minutes. */
const THIRDS: WheelOption[] = [0, 20, 40].map(minute => ({
  value: minute,
  label: String(minute).padStart(2, '0'),
}));

/** Months with only February, March and November enabled. */
const SOME_MONTHS: WheelOption[] = Array.from({length: 12}, (_, index) => ({
  value: index + 1,
  label: String(index + 1),
  isDisabled: ![2, 3, 11].includes(index + 1),
}));

/** A looping wheel's copies: the rows in the strip's hidden container. */
function copiesOf(column: Element): HTMLElement[] {
  const strip = column.querySelector<HTMLElement>('[data-wheel-strip]')!;
  const container = strip.querySelector(':scope > [aria-hidden="true"]');
  return container == null
    ? []
    : (Array.from(container.children) as HTMLElement[]);
}

/**
 * The label of the row drawn `rows` rows below the band, a copy or the
 * wheel's own row. Null when no row is drawn there.
 */
function labelDrawnAt(column: Element, rows: number): string | null {
  const strip = column.querySelector<HTMLElement>('[data-wheel-strip]')!;
  const [, y = '0'] = strip.style
    .getPropertyValue('translate')
    .trim()
    .split(/\s+/);
  const shift = Number.parseFloat(y) || 0;
  const own = Array.from(
    strip.querySelectorAll<HTMLElement>(':scope > [data-wheel-row]'),
  ).map((row, index) => ({row, place: index * ROW}));
  const copies = copiesOf(column).map(row => ({
    row,
    place: Number.parseFloat(row.style.insetBlockStart),
  }));
  for (const {row, place} of [...own, ...copies]) {
    if (Math.abs(place + shift - rows * ROW) < 1) {
      return row.textContent;
    }
  }
  return null;
}

/**
 * Records each animation the wheel plays on its strip: the offsets, in rows,
 * of its first and last keyframes. jsdom runs no Web Animations.
 */
function recordStripTurns(): {
  turns: {from: number; to: number}[];
  restore: () => void;
} {
  const turns: {from: number; to: number}[] = [];
  const offsetOf = (frame: Keyframe | undefined) => {
    const [, y = '0'] = String(frame?.translate ?? '')
      .trim()
      .split(/\s+/);
    return -(Number.parseFloat(y) || 0) / ROW;
  };
  Element.prototype.animate = vi.fn(function animate(
    this: Element,
    keyframes: Keyframe[],
  ) {
    if (this.hasAttribute('data-wheel-strip')) {
      turns.push({
        from: offsetOf(keyframes[0]),
        to: offsetOf(keyframes.at(-1)),
      });
    }
    return {cancel: () => {}} as unknown as Animation;
  });
  return {
    turns,
    restore: () => Reflect.deleteProperty(Element.prototype, 'animate'),
  };
}

/**
 * Records where each animation the wheel plays moves its strip to, as the
 * strip's last keyframe: jsdom runs no Web Animations. Returns the places
 * and the undo.
 */
function recordStripEnds(): {ends: number[]; restore: () => void} {
  const ends: number[] = [];
  Element.prototype.animate = vi.fn(function animate(
    this: Element,
    keyframes: Keyframe[],
  ) {
    if (this.hasAttribute('data-wheel-strip')) {
      const [, y = '0'] = String(keyframes.at(-1)?.translate ?? '')
        .trim()
        .split(/\s+/);
      ends.push(Number.parseFloat(y) || 0);
    }
    return {cancel: () => {}} as unknown as Animation;
  });
  return {
    ends,
    restore: () => Reflect.deleteProperty(Element.prototype, 'animate'),
  };
}

describe('PickerWheel — looping', () => {
  it('repeats a short list down the whole column: at :45 a 15-minute column reads 45 · 00 · 15 · 30 · 45', () => {
    const {column} = renderWheel({
      options: QUARTERS,
      value: 45,
      label: 'Minute',
      isLooping: true,
    });
    expect([0, 1, 2, 3, 4].map(rows => labelDrawnAt(column, rows))).toEqual([
      '45',
      '00',
      '15',
      '30',
      '45',
    ]);
    expect([-1, -2, -3].map(rows => labelDrawnAt(column, rows))).toEqual([
      '30',
      '15',
      '00',
    ]);
  });

  it('lists each value once for assistive technology: the copies are hidden', () => {
    const {column} = renderWheel({
      options: QUARTERS,
      value: 45,
      label: 'Minute',
      isLooping: true,
    });
    expect(screen.getAllByRole('option')).toHaveLength(4);
    const copies = copiesOf(column);
    expect(copies.length).toBeGreaterThan(0);
    expect(copies[0].parentElement).toHaveAttribute('aria-hidden', 'true');
    // The copies add no data attribute of their own.
    for (const copy of copies) {
      expect(
        copy.getAttributeNames().filter(name => name.startsWith('data-')),
      ).toEqual([]);
    }
  });

  it('never loops a single row', () => {
    const {column} = renderWheel({
      options: [{value: 0, label: '00'}],
      value: 0,
      label: 'Minute',
      isLooping: true,
    });
    expect(copiesOf(column)).toHaveLength(0);
    expect(labelDrawnAt(column, 1)).toBeNull();
  });

  it('steps a key one row on across the seam: ArrowDown on :59 commits :00', () => {
    const {column, onChange} = renderWheel({
      options: MINUTES,
      value: 59,
      label: 'Minute',
      isLooping: true,
    });
    fireEvent.keyDown(column, {key: 'ArrowDown'});
    expect(onChange).toHaveBeenLastCalledWith(0);
    advance(turnMs(1) + 10);
    expect(labelDrawnAt(column, 0)).toBe('00');
  });

  it('steps a key one row back across the seam: ArrowUp on :00 commits :59', () => {
    const {column, onChange} = renderWheel({
      options: MINUTES,
      value: 0,
      label: 'Minute',
      isLooping: true,
    });
    fireEvent.keyDown(column, {key: 'ArrowUp'});
    expect(onChange).toHaveBeenLastCalledWith(59);
    advance(turnMs(1) + 10);
    expect(labelDrawnAt(column, 0)).toBe('59');
  });

  it('never turns a key a whole revolution: with one enabled row it stays put', () => {
    const {column, onChange} = renderWheel({
      options: QUARTERS.map(option => ({
        ...option,
        isDisabled: option.value !== 45,
      })),
      value: 45,
      label: 'Minute',
      isLooping: true,
    });
    fireEvent.keyDown(column, {key: 'ArrowDown'});
    advance(2000);
    expect(onChange).not.toHaveBeenCalled();
    expect(labelDrawnAt(column, 0)).toBe('45');
  });

  it('turns onto a tapped copy two rows down and commits its value on arrival', () => {
    const {column, option, onChange} = renderWheel({
      options: QUARTERS,
      value: 45,
      label: 'Minute',
      isLooping: true,
    });
    const tap = CENTRE + 2 * ROW;
    touch('touchstart', column, tap);
    advance(60);
    touch('touchend', column, tap);
    advance(turnMs(2) + 10);
    expect(onChange).toHaveBeenCalledWith(15);
    // At rest the wheel shows its own row, not the copy it turned onto.
    expect(labelDrawnAt(column, 0)).toBe('15');
    expect(distanceOf(option('15'))).toBeCloseTo(0, 4);
  });

  it('turns onto a tapped copy of the committed row and commits nothing', () => {
    const {column, option, onChange} = renderWheel({
      options: THIRDS,
      value: 40,
      label: 'Minute',
      isLooping: true,
    });
    const tap = CENTRE + 3 * ROW;
    touch('touchstart', column, tap);
    advance(60);
    touch('touchend', column, tap);
    // It turns: no row is marked while a motion runs.
    advance(turnMs(3) / 2);
    expect(isMarked(option('40'))).toBe(false);
    advance(turnMs(3) + 10);
    expect(onChange).not.toHaveBeenCalled();
    expect(distanceOf(option('40'))).toBeCloseTo(0, 4);
    expect(isMarked(option('40'))).toBe(true);
  });

  it('runs a drag on through the seam with no rubber band, and commits where it rests', () => {
    const {column, option, onChange} = renderWheel({
      options: MINUTES,
      value: 58,
      label: 'Minute',
      isLooping: true,
    });
    // Up 3 rows (+10 px of hysteresis), held still, lifted: 58 → 01.
    drag(column, 180, 180 - 10 - 3 * ROW, {steps: 30, interval: 40, hold: 300});
    advance(2000);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(1);
    expect(distanceOf(option('01'))).toBeCloseTo(0, 4);
  });

  it('runs a fling on through the seam and rests on a row past it', () => {
    const {column, option, onChange} = renderWheel({
      options: MINUTES,
      value: 55,
      label: 'Minute',
      isLooping: true,
    });
    drag(column, 180, 60, {steps: 6, interval: 16});
    advance(4000);
    expect(onChange).toHaveBeenCalledTimes(1);
    const rested = onChange.mock.calls[0][0] as number;
    expect(rested).toBeLessThan(55);
    const label = String(rested).padStart(2, '0');
    expect(labelDrawnAt(column, 0)).toBe(label);
    expect(distanceOf(option(label))).toBeCloseTo(0, 4);
  });

  it('turns the shorter way round from a disabled row beside the seam', () => {
    const {column, onChange} = renderWheel({
      options: SOME_MONTHS,
      value: 2,
      label: 'Month',
      isLooping: true,
    });
    // Down 2 rows (+10 px of hysteresis), across the seam: the wheel rests on
    // December, disabled. November is one row back, February two on.
    drag(column, 60, 60 + 10 + 2 * ROW, {steps: 30, interval: 40, hold: 300});
    advance(3000);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(11);
    expect(labelDrawnAt(column, 0)).toBe('11');
  });

  it('turns onto a value set from outside the shorter way round: one row on, onto the next copy', () => {
    const {ends, restore} = recordStripEnds();
    try {
      const onChange = vi.fn();
      const {rerender} = render(
        <PickerWheel
          label="Minute"
          options={MINUTES}
          value={59}
          onChange={onChange}
          isLooping
        />,
      );
      rerender(
        <PickerWheel
          label="Minute"
          options={MINUTES}
          value={0}
          onChange={onChange}
          isLooping
        />,
      );
      // The strip moves up by minus the offset: to position 60, :00's copy.
      expect(ends.at(-1)).toBeCloseTo(-60 * ROW, 0);
      advance(turnMs(1) + 10);
      const column = screen.getByRole('listbox', {name: 'Minute'});
      expect(labelDrawnAt(column, 0)).toBe('00');
      expect(onChange).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it('takes Home and End to the first and last rows of the lap it is on, never across the seam', () => {
    const {column, onChange} = renderWheel({
      options: MINUTES,
      value: 3,
      label: 'Minute',
      isLooping: true,
    });
    fireEvent.keyDown(column, {key: 'End'});
    expect(onChange).toHaveBeenLastCalledWith(59);
    fireEvent.keyDown(column, {key: 'Home'});
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it('moves its strip onto its own rows as quick keys run on past the seam', () => {
    const {ends, restore} = recordStripEnds();
    try {
      const {column, onChange} = renderWheel({
        options: MINUTES,
        value: 59,
        label: 'Minute',
        isLooping: true,
      });
      // Each key steps from the row the wheel is heading to: 12 rows on.
      for (let i = 0; i < 12; i++) {
        fireEvent.keyDown(column, {key: 'ArrowDown'});
      }
      expect(onChange).toHaveBeenNthCalledWith(1, 0);
      expect(onChange).toHaveBeenLastCalledWith(11);
      // Passing the seam moved the strip a lap back, so the last turn ends on
      // :11 among the wheel's own rows.
      expect(ends.at(-1)).toBeCloseTo(-11 * ROW, 0);
    } finally {
      restore();
    }
  });

  it('draws every row a key’s turn crosses when it interrupts a fling heading laps ahead', () => {
    const {turns, restore} = recordStripTurns();
    try {
      const {column} = renderWheel({
        options: MINUTES,
        value: 30,
        label: 'Minute',
        isLooping: true,
      });
      // A very fast flick, heading laps past :00, then a key as it coasts off.
      drag(column, 210, 0, {steps: 4, interval: 8});
      advance(16);
      fireEvent.keyDown(column, {key: 'ArrowDown'});
      const turn = turns.at(-1)!;
      const drawn = new Set([
        ...MINUTES.map((_, index) => index),
        ...copiesOf(column).map(row =>
          Math.round(Number.parseFloat(row.style.insetBlockStart) / ROW),
        ),
      ]);
      const first = Math.floor(Math.min(turn.from, turn.to));
      const last = Math.ceil(Math.max(turn.from, turn.to));
      for (let position = first; position <= last; position++) {
        expect(drawn.has(position)).toBe(true);
      }
    } finally {
      restore();
    }
  });

  it('commits a spin across the seam as its own row', async () => {
    const ref = createRef<WheelHandle>();
    const {column, onChange} = renderWheel({
      options: MINUTES,
      value: 58,
      label: 'Minute',
      isLooping: true,
      ref,
    });
    let arrived: boolean | undefined;
    act(() => {
      void ref.current!.spinTo(2).then(value => {
        arrived = value;
      });
    });
    await advanceAsync(2000);
    expect(arrived).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith(2);
    expect(labelDrawnAt(column, 0)).toBe('02');
  });

  /**
   * An owner that clamps :01 to :09 onto :00, turning the wheel there first,
   * as TimeWheels does. `onSpun` hears whether that turn arrived.
   */
  function ClampingWheel({
    onCommit,
    onSpun,
  }: {
    onCommit: (value: number) => void;
    onSpun: (arrived: boolean) => void;
  }) {
    const [value, setValue] = useState(55);
    const wheelRef = useRef<WheelHandle | null>(null);
    return (
      <PickerWheel
        ref={wheelRef}
        label="Minute"
        options={MINUTES}
        value={value}
        isLooping
        onChange={next => {
          // Every minute from :01 to :09 clamps onto :00.
          const clamped = next > 0 && next < 10 ? 0 : next;
          if (clamped !== next) {
            void wheelRef.current?.spinTo(clamped).then(onSpun);
          }
          onCommit(clamped);
          setValue(clamped);
        }}
      />
    );
  }

  it('turns on from a value its owner clamps, as a key passes the seam into it', () => {
    const onCommit = vi.fn();
    render(<ClampingWheel onCommit={onCommit} onSpun={vi.fn()} />);
    const column = screen.getByRole('listbox', {name: 'Minute'});
    fireEvent.keyDown(column, {key: 'PageDown'});
    expect(onCommit).toHaveBeenLastCalledWith(0);
    advance(2000);
    // The owner's turn wins over the key's: the wheel rests on :00, not :05.
    expect(labelDrawnAt(column, 0)).toBe('00');
  });

  it('turns on from a value its owner clamps, as a rest past the seam lands in it', async () => {
    const onCommit = vi.fn();
    const onSpun = vi.fn();
    render(<ClampingWheel onCommit={onCommit} onSpun={onSpun} />);
    const column = screen.getByRole('listbox', {name: 'Minute'});
    column.getBoundingClientRect = () => ({
      top: 0,
      bottom: 216,
      left: 0,
      right: 120,
      width: 120,
      height: 216,
      x: 0,
      y: 0,
      toJSON() {},
    });
    // Up 7 rows (+10 px of hysteresis), held still, lifted: :55 to :02.
    drag(column, 200, 200 - 10 - 7 * ROW, {steps: 30, interval: 40, hold: 300});
    await advanceAsync(3000);
    expect(onCommit).toHaveBeenLastCalledWith(0);
    // The owner's own turn arrives: the rest moved the strip before the commit.
    expect(onSpun).toHaveBeenCalledWith(true);
    expect(labelDrawnAt(column, 0)).toBe('00');
  });

  it('rests a whole lap away on a committed value outside the bounds and commits nothing (component:DateInput FR13)', () => {
    // :00 to :09 are disabled, as under a 10:10 AM minimum at 10 AM.
    const {column, onChange} = renderWheel({
      options: MINUTES.map(option => ({
        ...option,
        isDisabled: option.value < 10,
      })),
      value: 5,
      label: 'Minute',
      isLooping: true,
    });
    // Up 60 rows (+10 px of hysteresis), held still, lifted: the wheel rests
    // on :05's copy one lap on.
    drag(column, 1900, 1900 - 10 - 60 * ROW, {
      steps: 60,
      interval: 16,
      hold: 300,
    });
    advance(3000);
    expect(onChange).not.toHaveBeenCalled();
    expect(labelDrawnAt(column, 0)).toBe('05');
  });

  it('with no enabled row, turns from a rest laps away onto the committed row’s nearest copy', () => {
    const {ends, restore} = recordStripEnds();
    try {
      const {column, onChange} = renderWheel({
        options: MINUTES.map(option => ({...option, isDisabled: true})),
        value: 30,
        label: 'Minute',
        isLooping: true,
      });
      // Up 124 rows (+10 px of hysteresis), held still, lifted: the wheel
      // rests at position 154, on :34. The nearest :30 is position 150.
      drag(column, 3700, 3700 - 10 - 124 * ROW, {
        steps: 124,
        interval: 16,
        hold: 300,
      });
      advance(3000);
      // The strip moves up by minus the offset: four rows back, not 124.
      expect(ends.at(-1)).toBeCloseTo(-150 * ROW, 0);
      expect(onChange).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });
});

describe('PickerWheel — markup', () => {
  // Written before the listbox wiring moved into useWheelListbox: the
  // snapshot holds the touch column to its markup.
  it('fades its rows on a layer inside the column, so the focus ring the column draws stays whole', () => {
    const {column} = renderWheel();
    const fade = column.querySelector('[data-wheel-fade]');
    expect(fade).not.toBeNull();
    expect(fade?.parentElement).toBe(column);
    expect(fade?.querySelector('[data-wheel-strip]')).not.toBeNull();
  });

  it('keeps the touch column’s markup', () => {
    const {column} = renderWheel();
    // React's generated ids depend on how many renders ran before.
    expect(
      column.parentElement?.innerHTML.replace(/_r_[0-9a-z]+_/g, '_r_id_'),
    ).toMatchSnapshot();
  });
});
