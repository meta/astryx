// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file NativePickerSegments.test.tsx
 * @input Uses vitest, @testing-library/react, DateTimeInput
 * @output Unit tests for DateTimeInput's native date and time picker segments
 * @position Testing; validates NativeDateSegment, NativeTimeSegment, and surface selection
 *
 * Every test renders through DateTimeInput so the three-value `nativePicker`
 * switch is covered together with both native controls.
 *
 * SYNC: When either native picker segment changes, update these tests
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {act, fireEvent, render, screen} from '@testing-library/react';
import * as stylex from '@stylexjs/stylex';
import {DateTimeInput} from './DateTimeInput';
import type {ISODateTimeString} from './DateTimeInput';
import {resetDateSegmentProbe} from '../DateInput/nativeDateSegments';

const HOVER_CAPABLE = /\(\s*hover\s*:\s*hover\s*\)/;

// jsdom does not perform intrinsic flex layout. These classes pin the
// DateInput-aligned native field floor and confirm that value slots remain
// shrinkable rather than carrying their own preferred width.
const nativeSizingProbe = stylex.create({
  row: {minInlineSize: 180},
  slot: {flex: 1, minInlineSize: 0},
});

function expectProbeClasses(
  element: HTMLElement,
  style: (typeof nativeSizingProbe)[keyof typeof nativeSizingProbe],
): void {
  const classes = (stylex.props(style).className ?? '')
    .split(' ')
    .filter(className => className !== '' && !className.includes('__'));
  expect(classes.length).toBeGreaterThan(0);
  for (const className of classes) {
    expect(element).toHaveClass(className);
  }
}

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function stubPointer(isCoarse: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: /pointer:\s*coarse/.test(query)
      ? isCoarse
      : /pointer:\s*fine/.test(query)
        ? !isCoarse
        : HOVER_CAPABLE.test(query),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

function getNativeDateInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('input[type="date"]');
  if (!input) {
    throw new Error('DateTimeInput rendered no native date control');
  }
  return input;
}

function getNativeTimeInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('input[type="time"]');
  if (!input) {
    throw new Error('DateTimeInput rendered no native time control');
  }
  return input;
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetDateSegmentProbe();
});

describe('DateTimeInput nativePicker', () => {
  it('renders native date and time controls on touch by default', () => {
    stubPointer(true);
    render(<DateTimeInput label="Meeting" onChange={() => {}} />);

    expect(getNativeDateInput()).toBeInTheDocument();
    expect(getNativeTimeInput()).toBe(screen.getByLabelText('Meeting time'));
  });

  it('uses DateInput’s native field floor with shrinkable value slots', () => {
    stubPointer(true);
    const {container} = render(
      <DateTimeInput label="Meeting" onChange={() => {}} />,
    );

    const row = container.querySelector('.astryx-date-time-input');
    expect(row).toBeInstanceOf(HTMLElement);
    expectProbeClasses(row as HTMLElement, nativeSizingProbe.row);

    for (const input of [getNativeDateInput(), getNativeTimeInput()]) {
      const slot = input.parentElement;
      expect(slot).toBeInstanceOf(HTMLElement);
      expectProbeClasses(slot as HTMLElement, nativeSizingProbe.slot);
    }
  });

  it('keeps Astryx text fields on a mouse device by default', () => {
    stubPointer(false);
    render(<DateTimeInput label="Meeting" onChange={() => {}} />);

    expect(document.querySelector('input[type="date"]')).toBeNull();
    expect(document.querySelector('input[type="time"]')).toBeNull();
    expect(screen.getByRole('combobox')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('Meeting time')).toHaveAttribute(
      'type',
      'text',
    );
  });

  it('uses Astryx’s coordinated touch sheet on touch when told never', () => {
    stubPointer(true);
    render(
      <DateTimeInput
        label="Meeting"
        nativePicker="never"
        onChange={() => {}}
      />,
    );

    expect(document.querySelector('input[type="date"]')).toBeNull();
    expect(document.querySelector('input[type="time"]')).toBeNull();
    expect(screen.getByRole('combobox', {name: 'Meeting'})).toHaveAttribute(
      'readonly',
    );
  });

  it('uses both native controls on a mouse device when told always', () => {
    stubPointer(false);
    render(
      <DateTimeInput
        label="Meeting"
        nativePicker="always"
        onChange={() => {}}
      />,
    );

    expect(getNativeDateInput()).toBeInTheDocument();
    expect(getNativeTimeInput()).toBeInTheDocument();
  });

  it('keeps disabled native controls focusable and inert (AST-085 FR1, FR2)', () => {
    stubPointer(true);
    const onClick = vi.fn();
    render(
      <DateTimeInput
        label="Meeting"
        isDisabled
        onClick={onClick}
        onChange={() => {}}
      />,
    );
    for (const input of [getNativeDateInput(), getNativeTimeInput()]) {
      expect(input).not.toHaveAttribute('disabled');
      expect(input).toHaveAttribute('aria-disabled', 'true');
      expect(input).toHaveAttribute('readonly');
      input.focus();
      expect(input).toHaveFocus();
    }
    fireEvent.click(getNativeDateInput());
    expect(onClick).not.toHaveBeenCalled();
  });

  it('leaves enabled native controls editable (AST-043)', () => {
    stubPointer(true);
    render(<DateTimeInput label="Meeting" onChange={() => {}} />);
    for (const input of [getNativeDateInput(), getNativeTimeInput()]) {
      expect(input).not.toHaveAttribute('readonly');
      expect(input).not.toHaveAttribute('aria-disabled');
    }
  });

  it('drops in-page popup ARIA because the OS owns both pickers', () => {
    stubPointer(true);
    render(<DateTimeInput label="Meeting" onChange={() => {}} />);

    for (const input of [getNativeDateInput(), getNativeTimeInput()]) {
      expect(input).not.toHaveAttribute('role', 'combobox');
      expect(input).not.toHaveAttribute('aria-expanded');
      expect(input).not.toHaveAttribute('aria-haspopup');
      expect(input).not.toHaveAttribute('aria-controls');
    }
  });

  it('keeps native values ISO and paints localized date/time text', () => {
    stubPointer(true);
    render(
      <DateTimeInput
        label="Meeting"
        value={'2026-03-15T14:30' as ISODateTimeString}
        onChange={() => {}}
      />,
    );

    expect(getNativeDateInput()).toHaveValue('2026-03-15');
    expect(getNativeTimeInput()).toHaveValue('14:30');
    expect(screen.getByText('March 15, 2026')).toBeInTheDocument();
    expect(screen.getByText('2:30 PM')).toBeInTheDocument();
  });

  it('changes the date while preserving the time', () => {
    stubPointer(true);
    const onChange = vi.fn();
    render(
      <DateTimeInput
        label="Meeting"
        value={'2026-03-15T14:30' as ISODateTimeString}
        onChange={onChange}
      />,
    );

    fireEvent.change(getNativeDateInput(), {target: {value: '2026-03-21'}});

    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-03-21T14:30');
  });

  it('changes the time while preserving the date', () => {
    stubPointer(true);
    const onChange = vi.fn();
    render(
      <DateTimeInput
        label="Meeting"
        value={'2026-03-15T14:30' as ISODateTimeString}
        onChange={onChange}
      />,
    );

    fireEvent.change(getNativeTimeInput(), {target: {value: '15:45'}});

    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-03-15T15:45');
  });

  it('reverts a native time edit when the controlled parent rejects it', () => {
    stubPointer(true);
    const onChange = vi.fn();
    render(
      <DateTimeInput
        label="Meeting"
        value={'2026-03-15T14:30' as ISODateTimeString}
        onChange={onChange}
      />,
    );
    const timeInput = getNativeTimeInput();
    fireEvent.focus(timeInput);

    fireEvent.change(timeInput, {target: {value: '15:45'}});
    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-03-15T15:45');
    fireEvent.blur(timeInput);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(timeInput).toHaveValue('14:30');
  });

  it.each([
    ['date', getNativeDateInput, '2026-03-21'],
    ['time', getNativeTimeInput, '15:45'],
  ] as const)(
    'does not replay a rejected optimistic %s edit on blur',
    async (_name, getInput, editedValue) => {
      stubPointer(true);
      const onChange = vi.fn();
      let resolveAction: (() => void) | undefined;
      const changeAction = vi.fn(
        async () =>
          new Promise<void>(resolve => {
            resolveAction = resolve;
          }),
      );
      render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T14:30' as ISODateTimeString}
          onChange={onChange}
          changeAction={changeAction}
        />,
      );
      const input = getInput();
      fireEvent.focus(input);
      fireEvent.change(input, {target: {value: editedValue}});
      expect(onChange).toHaveBeenCalledTimes(1);

      await act(async () => resolveAction?.());
      fireEvent.blur(input);

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(changeAction).toHaveBeenCalledTimes(1);
    },
  );

  it('keeps native picker edits enabled while changeAction is pending', () => {
    stubPointer(true);
    const onChange = vi.fn();
    const changeAction = vi.fn(async () => new Promise<void>(() => {}));
    render(
      <DateTimeInput
        label="Meeting"
        value={'2026-03-15T14:30' as ISODateTimeString}
        onChange={onChange}
        changeAction={changeAction}
      />,
    );
    const timeInput = getNativeTimeInput();

    fireEvent.change(timeInput, {target: {value: '15:00'}});
    expect(timeInput).toHaveAttribute('aria-busy', 'true');
    expect(timeInput).not.toBeDisabled();

    fireEvent.change(timeInput, {target: {value: '15:30'}});

    expect(onChange).toHaveBeenCalledWith('2026-03-15T15:00');
    expect(onChange).toHaveBeenCalledWith('2026-03-15T15:30');
    expect(changeAction).toHaveBeenCalledTimes(2);
  });

  it('retains a native time chosen before the date exists', () => {
    stubPointer(true);
    const onChange = vi.fn();
    render(<DateTimeInput label="Meeting" onChange={onChange} />);

    fireEvent.change(getNativeTimeInput(), {target: {value: '09:45'}});
    expect(onChange).not.toHaveBeenCalled();
    expect(getNativeTimeInput()).toHaveValue('09:45');

    fireEvent.change(getNativeDateInput(), {target: {value: '2026-03-21'}});

    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-03-21T09:45');
  });

  it('clamps a time chosen before the date to that date’s boundary', () => {
    stubPointer(true);
    const onChange = vi.fn();
    render(
      <DateTimeInput
        label="Meeting"
        min={'2026-03-21T09:00' as ISODateTimeString}
        onChange={onChange}
      />,
    );

    fireEvent.change(getNativeTimeInput(), {target: {value: '08:00'}});
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(getNativeDateInput(), {target: {value: '2026-03-21'}});

    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-03-21T09:00');
  });

  it('can clear an optimistic datetime created from an empty value', () => {
    stubPointer(true);
    const onChange = vi.fn();
    const changeAction = vi.fn(async () => new Promise<void>(() => {}));
    render(
      <DateTimeInput
        label="Meeting"
        onChange={onChange}
        changeAction={changeAction}
      />,
    );

    fireEvent.change(getNativeDateInput(), {target: {value: '2026-03-21'}});
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(getNativeTimeInput()).not.toBeDisabled();

    fireEvent.change(getNativeTimeInput(), {target: {value: ''}});

    expect(onChange).toHaveBeenLastCalledWith(undefined);
    expect(changeAction).toHaveBeenLastCalledWith(undefined);
  });

  it('retains the preset-time combobox when timeOptionInterval is set', () => {
    stubPointer(true);
    render(
      <DateTimeInput
        label="Meeting"
        timeOptionInterval={60}
        onChange={() => {}}
      />,
    );

    expect(getNativeDateInput()).toBeInTheDocument();
    expect(document.querySelector('input[type="time"]')).toBeNull();
    expect(screen.getByLabelText('Meeting time')).toHaveAttribute(
      'role',
      'combobox',
    );
  });

  it('clamps the preserved time at a datetime boundary', () => {
    stubPointer(true);
    const onChange = vi.fn();
    render(
      <DateTimeInput
        label="Meeting"
        value={'2026-03-16T08:00' as ISODateTimeString}
        min={'2026-03-15T09:00' as ISODateTimeString}
        onChange={onChange}
      />,
    );

    fireEvent.change(getNativeDateInput(), {target: {value: '2026-03-15'}});

    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-03-15T09:00');
  });

  it('forwards date and boundary-time constraints to the native controls', () => {
    stubPointer(true);
    render(
      <DateTimeInput
        label="Meeting"
        value={'2026-03-15T10:00' as ISODateTimeString}
        min={'2026-03-15T09:00' as ISODateTimeString}
        max={'2026-03-15T17:00' as ISODateTimeString}
        onChange={() => {}}
      />,
    );

    expect(getNativeDateInput()).toHaveAttribute('min', '2026-03-15');
    expect(getNativeDateInput()).toHaveAttribute('max', '2026-03-15');
    expect(getNativeTimeInput()).toHaveAttribute('min', '09:00');
    expect(getNativeTimeInput()).toHaveAttribute('max', '17:00');
    expect(getNativeTimeInput()).toHaveAttribute('step', '60');
  });

  it('retains the Astryx time field when seconds are requested', () => {
    stubPointer(true);
    render(
      <DateTimeInput
        label="Timestamp"
        value={'2026-03-15T14:30:45' as ISODateTimeString}
        hourFormat="24h"
        hasSeconds
        onChange={() => {}}
      />,
    );

    expect(getNativeDateInput()).toBeInTheDocument();
    expect(document.querySelector('input[type="time"]')).toBeNull();
    expect(screen.getByLabelText('Timestamp time')).toHaveValue('14:30:45');
  });

  it('retains the Astryx time field for a custom timeIncrement', () => {
    stubPointer(true);
    render(
      <DateTimeInput label="Meeting" timeIncrement={15} onChange={() => {}} />,
    );

    expect(getNativeDateInput()).toBeInTheDocument();
    expect(document.querySelector('input[type="time"]')).toBeNull();
    expect(screen.getByLabelText('Meeting time')).toHaveAttribute(
      'type',
      'text',
    );
  });

  it('refuses a custom date constraint and announces the rejection', () => {
    stubPointer(true);
    const onChange = vi.fn();
    render(
      <DateTimeInput
        label="Meeting"
        dateConstraints={[() => false]}
        onChange={onChange}
      />,
    );

    fireEvent.change(getNativeDateInput(), {target: {value: '2026-03-15'}});

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('Invalid date')).toBeInTheDocument();
    expect(getNativeDateInput()).toHaveAttribute('aria-invalid', 'true');
  });

  it('refuses an out-of-range native time and announces the rejection', () => {
    stubPointer(true);
    const onChange = vi.fn();
    render(
      <DateTimeInput
        label="Meeting"
        value={'2026-03-15T10:00' as ISODateTimeString}
        min={'2026-03-15T09:00' as ISODateTimeString}
        max={'2026-03-15T17:00' as ISODateTimeString}
        onChange={onChange}
      />,
    );

    fireEvent.change(getNativeTimeInput(), {target: {value: '08:00'}});

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('Invalid time')).toBeInTheDocument();
    expect(getNativeTimeInput()).toHaveAttribute('aria-invalid', 'true');
  });

  it('announces the same rejected date again after the picker closes', () => {
    stubPointer(true);
    const onChange = vi.fn();
    render(
      <DateTimeInput
        label="Meeting"
        dateConstraints={[() => false]}
        onChange={onChange}
      />,
    );
    const dateInput = getNativeDateInput();

    fireEvent.focus(dateInput);
    fireEvent.change(dateInput, {target: {value: '2026-03-15'}});
    fireEvent.blur(dateInput);
    expect(screen.queryByText('Invalid date')).not.toBeInTheDocument();

    fireEvent.focus(dateInput);
    fireEvent.change(dateInput, {target: {value: '2026-03-15'}});

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('Invalid date')).toBeInTheDocument();
  });

  it('observes native date and time events that bypass React change handling', () => {
    stubPointer(true);
    const onChange = vi.fn();
    render(
      <DateTimeInput
        label="Meeting"
        value={'2026-03-15T14:30' as ISODateTimeString}
        onChange={onChange}
      />,
    );

    const dateInput = getNativeDateInput();
    act(() => {
      dateInput.value = '2026-03-21';
      dateInput.dispatchEvent(new Event('input', {bubbles: true}));
    });
    expect(onChange).toHaveBeenLastCalledWith('2026-03-21T14:30');

    onChange.mockClear();
    const timeInput = getNativeTimeInput();
    act(() => {
      timeInput.value = '15:45';
      timeInput.dispatchEvent(new Event('input', {bubbles: true}));
    });
    expect(onChange).toHaveBeenLastCalledWith('2026-03-15T15:45');
  });

  it('does not overwrite externally changed values when native pickers blur', () => {
    stubPointer(true);
    const onChange = vi.fn();
    const renderInput = (value: ISODateTimeString) => (
      <DateTimeInput label="Meeting" value={value} onChange={onChange} />
    );
    const {rerender} = render(
      renderInput('2026-03-15T14:30' as ISODateTimeString),
    );
    const dateInput = getNativeDateInput();
    const timeInput = getNativeTimeInput();
    fireEvent.focus(dateInput);
    fireEvent.focus(timeInput);

    rerender(renderInput('2026-03-21T16:45' as ISODateTimeString));
    expect(dateInput).toHaveValue('2026-03-15');
    expect(timeInput).toHaveValue('14:30');

    fireEvent.blur(dateInput);
    fireEvent.blur(timeInput);

    expect(onChange).not.toHaveBeenCalled();
    expect(dateInput).toHaveValue('2026-03-21');
    expect(timeInput).toHaveValue('16:45');
  });

  it('opens the native time picker from the clock button', () => {
    stubPointer(true);
    render(<DateTimeInput label="Meeting" onChange={() => {}} />);
    const timeInput = getNativeTimeInput();
    const showPicker = vi.fn();
    (timeInput as HTMLInputElement & {showPicker: () => void}).showPicker =
      showPicker;

    fireEvent.click(screen.getByRole('button', {name: 'Open Meeting time'}));

    expect(timeInput).toHaveFocus();
    expect(showPicker).toHaveBeenCalledTimes(1);
  });

  it('clears without refocusing and reopening either native picker', () => {
    stubPointer(true);
    const onChange = vi.fn();
    render(
      <DateTimeInput
        label="Meeting"
        value={'2026-03-15T14:30' as ISODateTimeString}
        hasClear
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', {name: 'Clear Meeting'}));

    expect(onChange).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(getNativeDateInput()).not.toHaveFocus();
    expect(getNativeTimeInput()).not.toHaveFocus();
  });

  it('empties the whole datetime when either native control is reset', () => {
    stubPointer(true);
    const onChange = vi.fn();
    const {rerender} = render(
      <DateTimeInput
        label="Meeting"
        value={'2026-03-15T14:30' as ISODateTimeString}
        onChange={onChange}
      />,
    );

    fireEvent.change(getNativeDateInput(), {target: {value: ''}});
    expect(onChange).toHaveBeenLastCalledWith(undefined);

    onChange.mockClear();
    rerender(
      <DateTimeInput
        label="Meeting"
        value={'2026-03-15T14:30' as ISODateTimeString}
        onChange={onChange}
      />,
    );
    fireEvent.change(getNativeTimeInput(), {target: {value: ''}});
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('forwards the public ref to the native date input', () => {
    stubPointer(true);
    const ref = vi.fn();
    render(<DateTimeInput ref={ref} label="Meeting" onChange={() => {}} />);

    expect(ref).toHaveBeenCalledWith(getNativeDateInput());
  });
});
