// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TimeWheels.test.tsx
 * @input vitest, @testing-library/react, TimeWheels
 * @output Checks UIDatePicker's time wheels as one picker: the AM/PM column
 *   follows the hour and turns (never jumps) onto its new row, the hour
 *   column keeps the half of the day unless a rest passes between 11 and 12,
 *   and a time past a bound commits as the bound with the other columns
 *   turning onto it
 * @position Testing; the pure rules are timeWheelRules.test.ts. TimeWheels
 *   are the wheels under a finger, so the tests run under one, where the
 *   Wheel is UIPickerView's
 */

import {act, fireEvent, render, screen, within} from '@testing-library/react';
import {useState} from 'react';
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
import {WHEEL_ROW_HEIGHT} from '../DateInput/wheelOptions';
import type {ISOTimeString} from '../utils';
import {TimeWheels} from './TimeWheels';
import type {TimeParts} from './timeWheelRules';

// One fake clock for the whole file, as the Wheel's own tests: the gesture
// system keeps one timeline per document.
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

// A finger: TouchTimeField renders TimeWheels under one.
beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    // A finger, with no reduced-motion preference: the policy's combined
    // query names the pointer too, so the preference is checked first.
    matches:
      !query.includes('prefers-reduced-motion') &&
      /pointer:\s*coarse/.test(query),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
});

afterEach(() => {
  vi.advanceTimersByTime(10_000);
  vi.unstubAllGlobals();
});

afterAll(() => {
  vi.useRealTimers();
});

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function Harness({
  initial,
  hourFormat = '12h',
  hasSeconds = false,
  min,
  max,
  onCommit,
}: {
  initial: TimeParts;
  hourFormat?: '12h' | '24h';
  hasSeconds?: boolean;
  min?: ISOTimeString;
  max?: ISOTimeString;
  onCommit: (time: TimeParts) => void;
}) {
  const [time, setTime] = useState(initial);
  return (
    <TimeWheels
      time={time}
      hourFormat={hourFormat}
      hasSeconds={hasSeconds}
      min={min}
      max={max}
      isActive
      onCommit={next => {
        onCommit(next);
        setTime(next);
      }}
    />
  );
}

function renderWheels(props: Omit<Parameters<typeof Harness>[0], 'onCommit'>) {
  const onCommit = vi.fn();
  render(<Harness {...props} onCommit={onCommit} />);
  return {onCommit};
}

const column = (name: string) => screen.getByRole('listbox', {name});

/** The label of the row at rest under the band. */
function restingLabel(name: string): string | null {
  const list = column(name);
  const id = list.getAttribute('aria-activedescendant');
  return id == null ? null : (document.getElementById(id)?.textContent ?? null);
}

/** The rows a column draws, its own and its copies, at their places. */
function drawnRows(name: string): {row: HTMLElement; place: number}[] {
  const strip = column(name).querySelector<HTMLElement>('[data-wheel-strip]')!;
  const own = Array.from(
    strip.querySelectorAll<HTMLElement>(':scope > [data-wheel-row]'),
  ).map((row, index) => ({row, place: index}));
  const container = strip.querySelector(':scope > [aria-hidden="true"]');
  const copies = (
    container == null ? [] : (Array.from(container.children) as HTMLElement[])
  ).map(row => ({
    row,
    place: Number.parseFloat(row.style.insetBlockStart) / WHEEL_ROW_HEIGHT,
  }));
  return [...own, ...copies];
}

/** The label of the row drawn under the band, read from the strip itself. */
function drawnLabel(name: string): string | null {
  const strip = column(name).querySelector<HTMLElement>('[data-wheel-strip]')!;
  const [, y = '0'] = strip.style
    .getPropertyValue('translate')
    .trim()
    .split(/\s+/);
  const shift = (Number.parseFloat(y) || 0) / WHEEL_ROW_HEIGHT;
  const hit = drawnRows(name).find(({place}) => Math.abs(place + shift) < 0.1);
  return hit?.row.textContent ?? null;
}

const at = (hour: number, minute: number): TimeParts => ({
  hour,
  minute,
  second: 0,
});

describe('TimeWheels — the AM/PM column follows the hour', () => {
  it('turns AM to PM when the hour goes from 11 to 12, turning the AM/PM column', () => {
    const {onCommit} = renderWheels({initial: at(11, 58)});
    fireEvent.keyDown(column('Hour'), {key: 'ArrowDown'});
    expect(onCommit).toHaveBeenLastCalledWith(at(12, 58));
    // The column turns onto PM (its curve is sampled in the browser spec).
    advance(400);
    expect(restingLabel('AM/PM')).toBe('PM');
    expect(
      within(column('AM/PM')).getByRole('option', {name: 'PM'}),
    ).toHaveAttribute('aria-selected', 'true');
  });

  it('turns PM back to AM from 12 to 11', () => {
    const {onCommit} = renderWheels({initial: at(12, 58)});
    fireEvent.keyDown(column('Hour'), {key: 'ArrowUp'});
    expect(onCommit).toHaveBeenLastCalledWith(at(11, 58));
    advance(550);
    expect(restingLabel('AM/PM')).toBe('AM');
  });

  it('turns PM to AM from 11 PM to 12, midnight', () => {
    const {onCommit} = renderWheels({initial: at(23, 15)});
    // In time order no hour follows 11 PM, so a key cannot make this turn.
    fireEvent.click(within(column('Hour')).getByRole('option', {name: '12'}));
    expect(onCommit).toHaveBeenLastCalledWith(at(0, 15));
    advance(550);
    expect(restingLabel('Hour')).toBe('12');
    expect(restingLabel('AM/PM')).toBe('AM');
  });

  it('keeps the half of the day from 1 to 2', () => {
    const {onCommit} = renderWheels({initial: at(13, 58)});
    fireEvent.keyDown(column('Hour'), {key: 'ArrowDown'});
    expect(onCommit).toHaveBeenLastCalledWith(at(14, 58));
    advance(550);
    expect(restingLabel('AM/PM')).toBe('PM');
  });

  it('keeps PM from 12 to 1', () => {
    const {onCommit} = renderWheels({initial: at(12, 58)});
    fireEvent.keyDown(column('Hour'), {key: 'ArrowDown'});
    expect(onCommit).toHaveBeenLastCalledWith(at(13, 58));
    advance(550);
    expect(restingLabel('Hour')).toBe('1');
    expect(restingLabel('AM/PM')).toBe('PM');
  });

  it('keeps PM from 1 back to 12', () => {
    const {onCommit} = renderWheels({initial: at(13, 58)});
    fireEvent.keyDown(column('Hour'), {key: 'ArrowUp'});
    expect(onCommit).toHaveBeenLastCalledWith(at(12, 58));
    advance(550);
    expect(restingLabel('Hour')).toBe('12');
    expect(restingLabel('AM/PM')).toBe('PM');
  });

  it('keeps PM from 1 forward to 9, a rest that does not pass between 11 and 12', () => {
    const {onCommit} = renderWheels({initial: at(13, 58)});
    fireEvent.click(within(column('Hour')).getByRole('option', {name: '9'}));
    expect(onCommit).toHaveBeenLastCalledWith(at(21, 58));
    advance(550);
    expect(restingLabel('Hour')).toBe('9');
    expect(restingLabel('AM/PM')).toBe('PM');
  });

  it('leaves the hour on its row when the AM/PM column turns', () => {
    const {onCommit} = renderWheels({initial: at(9, 30)});
    fireEvent.keyDown(column('AM/PM'), {key: 'ArrowDown'});
    expect(onCommit).toHaveBeenLastCalledWith(at(21, 30));
    advance(550);
    expect(restingLabel('Hour')).toBe('9');
  });

  it('commits nothing when the AM/PM turn it started arrives and the owner kept the old time', () => {
    // An owner that refuses the commit keeps passing 11:58 AM.
    const onCommit = vi.fn();
    render(
      <TimeWheels
        time={at(11, 58)}
        hourFormat="12h"
        hasSeconds={false}
        isActive
        onCommit={onCommit}
      />,
    );
    fireEvent.keyDown(column('Hour'), {key: 'ArrowDown'});
    expect(onCommit).toHaveBeenLastCalledWith(at(12, 58));
    advance(550);
    expect(onCommit).not.toHaveBeenCalledWith(at(23, 58));
  });
});

describe('TimeWheels — minutes', () => {
  it('change only the minutes', () => {
    const {onCommit} = renderWheels({initial: at(12, 58)});
    fireEvent.keyDown(column('Minute'), {key: 'ArrowDown'});
    expect(onCommit).toHaveBeenLastCalledWith(at(12, 59));
    advance(550);
    expect(restingLabel('Hour')).toBe('12');
  });
});

describe('TimeWheels — the minute column loops, and its seam keeps the hour, as UIDatePicker’s does', () => {
  it('turns 11:59 AM into 11:00 AM for ArrowDown on the minutes: the hour and AM/PM stay', () => {
    const {onCommit} = renderWheels({initial: at(11, 59)});
    fireEvent.keyDown(column('Minute'), {key: 'ArrowDown'});
    expect(onCommit).toHaveBeenLastCalledWith(at(11, 0));
    advance(550);
    expect(drawnLabel('Minute')).toBe('00');
    expect(drawnLabel('Hour')).toBe('11');
    expect(drawnLabel('AM/PM')).toBe('AM');
  });

  it('turns 1:00 PM into 1:59 PM for ArrowUp on the minutes: the hour and PM stay', () => {
    const {onCommit} = renderWheels({initial: at(13, 0)});
    fireEvent.keyDown(column('Minute'), {key: 'ArrowUp'});
    expect(onCommit).toHaveBeenLastCalledWith(at(13, 59));
    advance(550);
    expect(drawnLabel('Minute')).toBe('59');
    expect(drawnLabel('Hour')).toBe('1');
    expect(drawnLabel('AM/PM')).toBe('PM');
  });

  it('turns 12:00 PM into 12:59 PM for ArrowUp on the minutes: the hour and PM stay', () => {
    const {onCommit} = renderWheels({initial: at(12, 0)});
    fireEvent.keyDown(column('Minute'), {key: 'ArrowUp'});
    expect(onCommit).toHaveBeenLastCalledWith(at(12, 59));
    advance(550);
    expect(drawnLabel('Minute')).toBe('59');
    expect(drawnLabel('Hour')).toBe('12');
    expect(drawnLabel('AM/PM')).toBe('PM');
  });

  it('turns 11:59 PM into 11:00 PM for ArrowDown on the minutes: the hour and PM stay', () => {
    const {onCommit} = renderWheels({initial: at(23, 59)});
    fireEvent.keyDown(column('Minute'), {key: 'ArrowDown'});
    expect(onCommit).toHaveBeenLastCalledWith(at(23, 0));
    advance(550);
    expect(drawnLabel('Minute')).toBe('00');
    expect(drawnLabel('Hour')).toBe('11');
    expect(drawnLabel('AM/PM')).toBe('PM');
  });

  it('turns 11:55 AM into 11:05 AM for PageDown on the minutes, ten rows on across the seam', () => {
    const {onCommit} = renderWheels({initial: at(11, 55)});
    fireEvent.keyDown(column('Minute'), {key: 'PageDown'});
    expect(onCommit).toHaveBeenLastCalledWith(at(11, 5));
    advance(550);
    expect(drawnLabel('Minute')).toBe('05');
    expect(drawnLabel('Hour')).toBe('11');
  });

  it('keeps 12:58 PM’s hour four minute rows on: 12:02 PM, as UIDatePicker does', () => {
    const {onCommit} = renderWheels({initial: at(12, 58)});
    for (let i = 0; i < 4; i++) {
      fireEvent.keyDown(column('Minute'), {key: 'ArrowDown'});
    }
    expect(onCommit).toHaveBeenLastCalledWith(at(12, 2));
    advance(550);
    expect(drawnLabel('Minute')).toBe('02');
    expect(drawnLabel('Hour')).toBe('12');
    expect(drawnLabel('AM/PM')).toBe('PM');
  });

  it('keeps the hour for Home and End on the minutes: 10:03 AM to 10:59 AM', () => {
    const {onCommit} = renderWheels({initial: at(10, 3)});
    fireEvent.keyDown(column('Minute'), {key: 'End'});
    expect(onCommit).toHaveBeenLastCalledWith(at(10, 59));
    advance(550);
    expect(restingLabel('Hour')).toBe('10');
  });

  it('skips the minutes past a 1:30 PM maximum when ArrowUp passes the seam from 1:00 PM', () => {
    const {onCommit} = renderWheels({
      initial: at(13, 0),
      max: '13:30' as ISOTimeString,
    });
    fireEvent.keyDown(column('Minute'), {key: 'ArrowUp'});
    expect(onCommit).toHaveBeenLastCalledWith(at(13, 30));
    advance(550);
    expect(drawnLabel('Minute')).toBe('30');
  });

  it('greys the minutes drawn above :00 at a 5 PM maximum: they are 5 PM’s own', () => {
    renderWheels({initial: at(17, 0), max: '17:00' as ISOTimeString});
    const above = drawnRows('Minute').filter(
      ({place}) => place >= -4 && place <= -1,
    );
    expect(above.map(({row}) => row.textContent)).toEqual([
      '56',
      '57',
      '58',
      '59',
    ]);
    for (const {row} of above) {
      expect(row.className.includes('rowDisabled')).toBe(true);
    }
  });
});

describe('TimeWheels — bounds', () => {
  it('commit a time past a bound as the bound, turning the other columns onto it', () => {
    const {onCommit} = renderWheels({
      initial: at(10, 15),
      min: '09:30' as ISOTimeString,
    });
    fireEvent.keyDown(column('Hour'), {key: 'ArrowUp'});
    expect(onCommit).toHaveBeenLastCalledWith(at(9, 30));
    // The minutes turn onto the bound with the hour.
    advance(400);
    expect(restingLabel('Hour')).toBe('9');
    expect(restingLabel('Minute')).toBe('30');
  });

  it('bring an AM/PM turn past the maximum back onto it', () => {
    const {onCommit} = renderWheels({
      initial: at(11, 30),
      min: '09:00' as ISOTimeString,
      max: '17:00' as ISOTimeString,
    });
    fireEvent.keyDown(column('AM/PM'), {key: 'ArrowDown'});
    expect(onCommit).toHaveBeenLastCalledWith(at(17, 0));
    advance(550);
    expect(restingLabel('Hour')).toBe('5');
    expect(restingLabel('Minute')).toBe('00');
    expect(restingLabel('AM/PM')).toBe('PM');
  });

  it('show an untouched time outside the bounds as it is, and commit nothing', () => {
    // Opening the sheet never changes the value: an 8:00 under a 9:00
    // minimum stays 8:00 on the wheels, on its disabled rows.
    const {onCommit} = renderWheels({
      initial: at(8, 0),
      min: '09:00' as ISOTimeString,
    });
    advance(600);
    expect(restingLabel('Hour')).toBe('8');
    expect(restingLabel('Minute')).toBe('00');
    expect(restingLabel('AM/PM')).toBe('AM');
    expect(onCommit).not.toHaveBeenCalled();
  });
});
