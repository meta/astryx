// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TimeWheelsTouch.test.tsx
 * @input Uses vitest, Testing Library, TimeInput and DateTimeInput
 * @output Tests that the bottom sheet's time wheels follow UIDatePicker under
 *   a finger, on iOS WebKit and on Android alike: the AM/PM column follows the
 *   hour; under a mouse each scrolling column turns on its own
 * @position Testing; the touch gate of TouchTimeField and TouchDateTimeField
 */

import {useState} from 'react';
import {afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import {fireEvent, render, screen, within} from '@testing-library/react';
import {TimeInput} from './TimeInput';
import {DateTimeInput} from '../DateTimeInput/DateTimeInput';
import {IOS_SUPPORTS_QUERY} from '../utils/touchPresentation';
import type {ISODateTimeString} from '../DateTimeInput/DateTimeInput';
import type {ISOTimeString} from '../utils';

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

/**
 * A device: a finger or a mouse, and whether the engine is iOS WebKit. The
 * sheet's behaviour depends only on the pointer; the engine is stubbed to
 * show that an iPhone and an Android finger get the same wheels.
 */
function stubDevice({
  isCoarse,
  isIosWebKit,
}: {
  isCoarse: boolean;
  isIosWebKit: boolean;
}): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    // No reduced-motion preference; the policy's combined query names the
    // pointer too, so the preference is checked first.
    matches: query.includes('prefers-reduced-motion')
      ? false
      : /pointer:\s*coarse/.test(query)
        ? isCoarse
        : /pointer:\s*fine/.test(query)
          ? !isCoarse
          : false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
  vi.stubGlobal('CSS', {
    supports: (condition: string) =>
      isIosWebKit && condition === IOS_SUPPORTS_QUERY,
  });
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
}

const IOS = {isCoarse: true, isIosWebKit: true};
const ANDROID = {isCoarse: true, isIosWebKit: false};
const MOUSE = {isCoarse: false, isIosWebKit: false};

beforeAll(() => {
  window.scrollTo = vi.fn();
  Element.prototype.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function ControlledTime({
  initial,
  onChange,
}: {
  initial: ISOTimeString;
  onChange: (value: ISOTimeString | undefined) => void;
}) {
  const [value, setValue] = useState<ISOTimeString | undefined>(initial);
  return (
    <TimeInput
      label="Alarm"
      presentation="bottom-sheet"
      value={value}
      onChange={next => {
        onChange(next);
        setValue(next);
      }}
    />
  );
}

function openTimeSheet() {
  fireEvent.click(screen.getByRole('combobox', {name: 'Alarm'}));
  return {
    hour: screen.getByRole('listbox', {name: 'Hour'}),
    minute: screen.getByRole('listbox', {name: 'Minute'}),
  };
}

describe('TimeInput sheet wheels under a finger and a mouse', () => {
  it.each([
    ['an iPhone', IOS],
    ['an Android', ANDROID],
  ])('turns AM to PM from 11 to 12 under %s finger', (_, device) => {
    stubDevice(device);
    const onChange = vi.fn();
    render(
      <ControlledTime initial={'11:58' as ISOTimeString} onChange={onChange} />,
    );
    fireEvent.keyDown(openTimeSheet().hour, {key: 'ArrowDown'});
    expect(onChange).toHaveBeenLastCalledWith('12:58');
  });

  it('keeps each column on its own under a mouse', () => {
    stubDevice(MOUSE);
    expect(matchMedia('(pointer: coarse)').matches).toBe(false);
    const onChange = vi.fn();
    render(
      <ControlledTime initial={'11:58' as ISOTimeString} onChange={onChange} />,
    );
    // In time order no AM hour follows 11 AM, so a click turns the column.
    const {hour} = openTimeSheet();
    fireEvent.click(within(hour).getByRole('option', {name: '12'}));
    expect(onChange).toHaveBeenLastCalledWith('00:58');
  });
});

describe('a bound between whole minutes', () => {
  it.each([
    ['an iPhone', IOS],
    ['a mouse', MOUSE],
  ])('commits the nearest whole minute inside it, with %s', (_, device) => {
    stubDevice(device);
    const onChange = vi.fn();
    render(
      <TimeInput
        label="Alarm"
        presentation="bottom-sheet"
        value={'10:00' as ISOTimeString}
        min={'09:00:30' as ISOTimeString}
        onChange={onChange}
      />,
    );
    const {hour} = openTimeSheet();
    fireEvent.click(within(hour).getByRole('option', {name: '9'}));
    expect(onChange).toHaveBeenLastCalledWith('09:01');
  });
});

describe('a bound with no whole minute inside the range', () => {
  it.each([
    ['an iPhone', IOS],
    ['a mouse', MOUSE],
  ])('commits the bound itself, with %s', (_, device) => {
    stubDevice(device);
    const onChange = vi.fn();
    render(
      <TimeInput
        label="Alarm"
        presentation="bottom-sheet"
        value={'22:00' as ISOTimeString}
        min={'23:59:30' as ISOTimeString}
        onChange={onChange}
      />,
    );
    const {hour} = openTimeSheet();
    // 11 PM is the only hour with a row inside the bounds, and 23:00 is still
    // below the minimum. A minute inside that hour has no row, so the bound,
    // seconds and all, is the only time the rest can commit.
    fireEvent.click(within(hour).getByRole('option', {name: '11'}));
    expect(onChange).toHaveBeenLastCalledWith('23:59:30');
  });
});

describe('opening a bounded sheet never changes an untouched value', () => {
  it.each([
    ['an iPhone', IOS],
    ['an Android', ANDROID],
  ])(
    'TimeInput under %s finger: 8:00 under a 9:00 minimum stays 8:00, and an empty field stays empty',
    (_, device) => {
      stubDevice(device);
      const onChange = vi.fn();
      const {unmount} = render(
        <TimeInput
          label="Alarm"
          presentation="bottom-sheet"
          value={'08:00' as ISOTimeString}
          min={'09:00' as ISOTimeString}
          max={'17:00' as ISOTimeString}
          onChange={onChange}
        />,
      );
      const {hour} = openTimeSheet();
      expect(
        document.getElementById(hour.getAttribute('aria-activedescendant')!)
          ?.textContent,
      ).toBe('8');
      expect(onChange).not.toHaveBeenCalled();
      unmount();

      render(
        <TimeInput
          label="Alarm"
          presentation="bottom-sheet"
          min={'09:00' as ISOTimeString}
          max={'17:00' as ISOTimeString}
          onChange={onChange}
        />,
      );
      openTimeSheet();
      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByRole('combobox', {name: 'Alarm'})).toHaveValue('');
    },
  );

  it('DateTimeInput: a time before the minimum stays, and an empty field stays empty', () => {
    stubDevice(ANDROID);
    const onChange = vi.fn();
    const {unmount} = render(
      <DateTimeInput
        label="Meeting"
        presentation="bottom-sheet"
        value={'2026-03-15T08:00' as ISODateTimeString}
        min={'2026-03-15T09:00' as ISODateTimeString}
        max={'2026-03-15T17:00' as ISODateTimeString}
        onChange={onChange}
      />,
    );
    const hour = openTimePanel();
    expect(
      document.getElementById(hour.getAttribute('aria-activedescendant')!)
        ?.textContent,
    ).toBe('8');
    expect(onChange).not.toHaveBeenCalled();
    unmount();

    render(
      <DateTimeInput
        label="Meeting"
        presentation="bottom-sheet"
        min={'2026-03-15T09:00' as ISODateTimeString}
        max={'2026-03-15T17:00' as ISODateTimeString}
        onChange={onChange}
      />,
    );
    openTimePanel();
    expect(onChange).not.toHaveBeenCalled();
  });
});

function ControlledDateTime({
  initial = '2026-03-15T11:58' as ISODateTimeString,
  onChange,
}: {
  initial?: ISODateTimeString;
  onChange: (value: ISODateTimeString | undefined) => void;
}) {
  const [value, setValue] = useState<ISODateTimeString | undefined>(initial);
  return (
    <DateTimeInput
      label="Meeting"
      presentation="bottom-sheet"
      value={value}
      onChange={next => {
        onChange(next);
        setValue(next);
      }}
    />
  );
}

function openTimePanel() {
  fireEvent.click(screen.getAllByRole('button', {name: /^Open /})[0]);
  fireEvent.click(screen.getByRole('radio', {name: 'Time'}));
  return screen.getByRole('listbox', {name: 'Hour'});
}

describe('DateTimeInput sheet wheels under a finger and a mouse', () => {
  it.each([
    ['an iPhone', IOS],
    ['an Android', ANDROID],
  ])('turns AM to PM from 11 to 12 under %s finger', (_, device) => {
    stubDevice(device);
    const onChange = vi.fn();
    render(<ControlledDateTime onChange={onChange} />);
    fireEvent.keyDown(openTimePanel(), {key: 'ArrowDown'});
    expect(onChange).toHaveBeenLastCalledWith('2026-03-15T12:58');
  });

  it('keeps each column on its own under a mouse', () => {
    stubDevice(MOUSE);
    expect(matchMedia('(pointer: coarse)').matches).toBe(false);
    const onChange = vi.fn();
    render(<ControlledDateTime onChange={onChange} />);
    // In time order no AM hour follows 11 AM, so a click turns the column.
    fireEvent.click(within(openTimePanel()).getByRole('option', {name: '12'}));
    expect(onChange).toHaveBeenLastCalledWith('2026-03-15T00:58');
  });
});
