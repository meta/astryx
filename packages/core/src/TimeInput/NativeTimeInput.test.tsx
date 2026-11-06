// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file NativeTimeInput.test.tsx
 * @input Uses vitest, Testing Library, TimeInput, and InputGroup
 * @output Regression tests for TimeInput's browser/OS picker surface
 * @position Testing; covers nativePicker selection and standalone integration
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {act, fireEvent, render, screen} from '@testing-library/react';
import {TimeInput} from './TimeInput';
import {InternationalizationProvider} from '../i18n';
import {InputGroup, InputGroupText} from '../InputGroup';
import {resetDateSegmentProbe} from '../DateInput/nativeDateSegments';
import type {ISOTimeString} from '../utils';

const HOVER_CAPABLE = /\(\s*hover\s*:\s*hover\s*\)/;

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

function getNativeTimeInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('input[type="time"]');
  if (!input) {
    throw new Error('TimeInput rendered no native time control');
  }
  return input;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetDateSegmentProbe();
});

describe('TimeInput nativePicker', () => {
  it("shows the resting value in the locale's hour cycle", () => {
    stubPointer(true);
    render(
      <InternationalizationProvider locale="de-DE">
        <TimeInput
          label="Start time"
          value={'14:30' as ISOTimeString}
          onChange={() => {}}
        />
      </InternationalizationProvider>,
    );
    expect(getNativeTimeInput()).toHaveValue('14:30');
    expect(screen.getByText('14:30')).toBeInTheDocument();
    expect(screen.queryByText('2:30 PM')).toBeNull();
  });

  it('uses the browser/OS picker on a coarse pointer by default', () => {
    stubPointer(true);
    render(
      <TimeInput
        label="Start time"
        value={'14:30' as ISOTimeString}
        onChange={() => {}}
      />,
    );

    expect(getNativeTimeInput()).toHaveValue('14:30');
    expect(screen.getByLabelText('Start time')).toBe(getNativeTimeInput());
    expect(screen.getByRole('button', {name: 'Open Start time'})).toBeVisible();
    expect(document.querySelector('input[type="text"]')).toBeNull();
  });

  it('keeps the Astryx typed field on a fine pointer by default', () => {
    stubPointer(false);
    render(<TimeInput label="Start time" onChange={() => {}} />);

    expect(screen.getByRole('textbox', {name: 'Start time'})).toHaveAttribute(
      'type',
      'text',
    );
    expect(document.querySelector('input[type="time"]')).toBeNull();
  });

  it('supports explicit always and never modes', () => {
    stubPointer(false);
    const {rerender} = render(
      <TimeInput
        label="Start time"
        nativePicker="always"
        onChange={() => {}}
      />,
    );
    expect(getNativeTimeInput()).toBeInTheDocument();

    stubPointer(true);
    rerender(
      <TimeInput label="Start time" nativePicker="never" onChange={() => {}} />,
    );
    expect(
      screen.getByRole('textbox', {name: 'Start time'}),
    ).toBeInTheDocument();
    expect(document.querySelector('input[type="time"]')).toBeNull();
  });

  it.each([
    ['seconds', {hasSeconds: true}],
    ['custom increment', {increment: 15}],
  ] as const)(
    'retains the typed field for %s under adaptive-native (default)',
    (_name, props) => {
      stubPointer(true);
      render(<TimeInput label="Start time" onChange={() => {}} {...props} />);

      expect(
        screen.getByRole('textbox', {name: 'Start time'}),
      ).toBeInTheDocument();
      expect(document.querySelector('input[type="time"]')).toBeNull();
    },
  );

  it.each([
    ['seconds', {hasSeconds: true}],
    ['custom increment', {increment: 15}],
  ] as const)(
    'forces the native field for %s under presentation="native" (FR2)',
    (_name, props) => {
      stubPointer(false);
      render(
        <TimeInput
          label="Start time"
          presentation="native"
          onChange={() => {}}
          {...props}
        />,
      );

      expect(getNativeTimeInput()).toBeInTheDocument();
    },
  );

  it('deprecated nativePicker="always" keeps released fallbacks (FR2 legacy)', () => {
    stubPointer(false);
    render(
      <TimeInput
        label="Start time"
        nativePicker="always"
        hasSeconds
        onChange={() => {}}
      />,
    );

    expect(
      screen.getByRole('textbox', {name: 'Start time'}),
    ).toBeInTheDocument();
    expect(document.querySelector('input[type="time"]')).toBeNull();
  });

  it('commits native edits and rejects values outside min/max', () => {
    stubPointer(true);
    const onChange = vi.fn();
    render(
      <TimeInput
        label="Start time"
        value={'09:00' as ISOTimeString}
        onChange={onChange}
        min={'08:00' as ISOTimeString}
        max={'17:00' as ISOTimeString}
      />,
    );
    const input = getNativeTimeInput();

    fireEvent.change(input, {target: {value: '10:15'}});
    expect(onChange).toHaveBeenCalledExactlyOnceWith('10:15');

    fireEvent.change(input, {target: {value: '18:00'}});
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('keeps the native picker enabled while changeAction is pending', () => {
    stubPointer(true);
    const changeAction = vi.fn(async () => new Promise<void>(() => {}));
    render(
      <TimeInput
        label="Start time"
        value={'09:00' as ISOTimeString}
        onChange={() => {}}
        changeAction={changeAction}
      />,
    );
    const input = getNativeTimeInput();

    fireEvent.change(input, {target: {value: '10:00'}});

    expect(changeAction).toHaveBeenCalledExactlyOnceWith('10:00');
    expect(input).not.toBeDisabled();
    expect(input).toHaveAttribute('aria-busy', 'true');
  });

  it('preserves grouped accessible names and descriptions', () => {
    stubPointer(true);
    render(
      <InputGroup label="Schedule" description="Use local time">
        <InputGroupText>Starts</InputGroupText>
        <TimeInput
          label="Start time"
          description="Business hours only"
          nativePicker="always"
          onChange={() => {}}
        />
      </InputGroup>,
    );

    const input = screen.getByLabelText('Schedule Start time');
    const describedBy =
      input.getAttribute('aria-describedby')?.split(' ') ?? [];
    const describedText = describedBy
      .map(id => document.getElementById(id)?.textContent)
      .join(' ');
    expect(describedText).toContain('Use local time');
    expect(describedText).toContain('Business hours only');
  });

  it('keeps a disabled reason discoverable without enabling the picker', () => {
    stubPointer(true);
    render(
      <TimeInput
        label="Start time"
        nativePicker="always"
        isDisabled
        disabledMessage="Time edits are locked"
        onChange={() => {}}
      />,
    );

    const input = getNativeTimeInput();
    expect(input).not.toBeDisabled();
    expect(input).toHaveAttribute('aria-disabled', 'true');
    expect(input).toHaveAttribute('readonly');
    // The shared native time segment's picker button is focusable-disabled
    // (spec:AST-085 FR1) and still blocks opening.
    expect(
      screen.getByRole('button', {name: 'Open Start time'}),
    ).toHaveAttribute('aria-disabled', 'true');
    const tooltip = document.querySelector<HTMLElement>('[role="tooltip"]');
    expect(tooltip).not.toBeNull();
    expect(input.getAttribute('aria-describedby')).toContain(tooltip?.id);
  });

  it('keeps a disabled native field focusable without native disabled (AST-085 FR1, FR2)', () => {
    stubPointer(true);
    const onClick = vi.fn();
    render(
      <TimeInput
        label="Start time"
        nativePicker="always"
        isDisabled
        onClick={onClick}
        onChange={() => {}}
      />,
    );
    const input = getNativeTimeInput();
    expect(input).not.toHaveAttribute('disabled');
    expect(input).toHaveAttribute('aria-disabled', 'true');
    expect(input).toHaveAttribute('readonly');
    input.focus();
    expect(input).toHaveFocus();
    fireEvent.click(input);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('forwards refs and autofocus to the native input', () => {
    stubPointer(true);
    const ref = vi.fn();
    render(
      <TimeInput
        ref={ref}
        label="Start time"
        nativePicker="always"
        hasAutoFocus
        onChange={() => {}}
      />,
    );

    expect(ref).toHaveBeenCalledWith(getNativeTimeInput());
    expect(getNativeTimeInput()).toHaveAttribute('data-autofocus', 'true');
  });

  it('clears without refocusing and reopening the native picker', () => {
    stubPointer(true);
    const onChange = vi.fn();
    render(
      <TimeInput
        label="Start time"
        value={'09:00' as ISOTimeString}
        nativePicker="always"
        hasClear
        onChange={onChange}
      />,
    );
    const input = getNativeTimeInput();
    const showPicker = vi.fn();
    input.showPicker = showPicker;

    fireEvent.click(screen.getByRole('button', {name: 'Clear Start time'}));

    expect(onChange).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(input).not.toHaveFocus();
    expect(showPicker).not.toHaveBeenCalled();
  });

  it('opens the native picker from the clock button', () => {
    stubPointer(true);
    render(
      <TimeInput
        label="Start time"
        nativePicker="always"
        onChange={() => {}}
      />,
    );
    const input = getNativeTimeInput();
    const showPicker = vi.fn();
    input.showPicker = showPicker;

    act(() => {
      screen.getByRole('button', {name: 'Open Start time'}).click();
    });

    expect(input).toHaveFocus();
    expect(showPicker).toHaveBeenCalledTimes(1);
  });
});
