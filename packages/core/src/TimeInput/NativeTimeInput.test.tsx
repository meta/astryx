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

describe('TimeInput native rejected entries', () => {
  function nativeField(
    props: Partial<React.ComponentProps<typeof TimeInput>> = {},
  ) {
    return (
      <TimeInput
        label="Start time"
        presentation="native"
        value={'09:00' as ISOTimeString}
        onChange={() => {}}
        min={'08:00' as ISOTimeString}
        max={'17:00' as ISOTimeString}
        {...props}
      />
    );
  }

  function statusText(container: HTMLElement): string | null {
    return container.querySelector('.astryx-field-status')?.textContent ?? null;
  }

  function fieldAlert(container: HTMLElement): HTMLElement | null {
    return container.querySelector('.astryx-time-input [role="alert"]');
  }

  it('shows an edit outside min/max as a message when the control reports it', () => {
    const {container} = render(nativeField());
    const input = getNativeTimeInput();
    fireEvent.focus(input);
    fireEvent.change(input, {target: {value: '18:00'}});
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(statusText(container)).toBe('Invalid time');
    expect(fieldAlert(container)).toHaveTextContent('');
  });

  it('restores the committed time at blur, not at Enter, and keeps the rejection shown', () => {
    const onChange = vi.fn();
    const {container} = render(nativeField({onChange}));
    const input = getNativeTimeInput();
    fireEvent.focus(input);
    fireEvent.change(input, {target: {value: '18:00'}});
    fireEvent.keyDown(input, {key: 'Enter'});
    expect(input.value).toBe('18:00');
    fireEvent.blur(input);
    expect(input.value).toBe('09:00');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(statusText(container)).toBe('Invalid time');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('clears the rejection for an accepted edit or a new value', () => {
    const onChange = vi.fn();
    const {container, rerender} = render(nativeField({onChange}));
    const input = getNativeTimeInput();
    fireEvent.focus(input);
    fireEvent.change(input, {target: {value: '18:00'}});
    fireEvent.change(input, {target: {value: '10:30'}});
    expect(onChange).toHaveBeenCalledExactlyOnceWith('10:30');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(statusText(container)).toBeNull();

    fireEvent.change(input, {target: {value: '18:00'}});
    fireEvent.blur(input);
    rerender(nativeField({onChange, value: '11:00' as ISOTimeString}));
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(statusText(container)).toBeNull();
  });

  it.each([
    ['hasSeconds', {hasSeconds: true}, '9:00:00 AM'],
    ['a non-1 increment', {increment: 5}, '9:00 AM'],
  ] as const)(
    'ends a native rejection when %s brings back the typed field',
    (_label, change, shown) => {
      stubPointer(true);
      const field = (props = {}) =>
        nativeField({presentation: 'adaptive-native', ...props});
      const {container, rerender} = render(field());
      fireEvent.change(getNativeTimeInput(), {target: {value: '18:00'}});
      expect(statusText(container)).toBe('Invalid time');
      rerender(field(change));
      const input = screen.getByRole('textbox', {name: 'Start time'});
      expect(input).toHaveValue(shown);
      expect(input).not.toHaveAttribute('aria-invalid');
      expect(statusText(container)).toBeNull();
      expect(fieldAlert(container)).toHaveTextContent('');
    },
  );

  it('ends a native rejection when a pointer change brings back the typed field', () => {
    let isCoarse = true;
    const listeners = new Set<() => void>();
    vi.stubGlobal('matchMedia', (query: string) => ({
      get matches() {
        return /pointer:\s*coarse/.test(query)
          ? isCoarse
          : /pointer:\s*fine/.test(query)
            ? !isCoarse
            : HOVER_CAPABLE.test(query);
      },
      media: query,
      onchange: null,
      addListener: (listener: () => void) => listeners.add(listener),
      removeListener: (listener: () => void) => listeners.delete(listener),
      addEventListener: (_type: string, listener: () => void) =>
        listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) =>
        listeners.delete(listener),
      dispatchEvent: () => false,
    }));
    const {container} = render(nativeField({presentation: 'adaptive-native'}));
    fireEvent.change(getNativeTimeInput(), {target: {value: '18:00'}});
    expect(statusText(container)).toBe('Invalid time');
    isCoarse = false;
    act(() => listeners.forEach(listener => listener()));
    const input = screen.getByRole('textbox', {name: 'Start time'});
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(statusText(container)).toBeNull();
  });

  it('hides a native rejection while busy and shows it again once idle, and drops it when the field becomes disabled', () => {
    const {container, rerender} = render(nativeField());
    const input = getNativeTimeInput();
    fireEvent.focus(input);
    fireEvent.change(input, {target: {value: '18:00'}});
    fireEvent.blur(input);
    expect(statusText(container)).toBe('Invalid time');

    rerender(nativeField({isLoading: true}));
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(statusText(container)).toBeNull();
    rerender(nativeField());
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(statusText(container)).toBe('Invalid time');

    rerender(nativeField({isDisabled: true}));
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(statusText(container)).toBeNull();
    rerender(nativeField());
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(statusText(container)).toBeNull();
    expect(fieldAlert(container)).toHaveTextContent('');
  });

  it('inside an InputGroup, announces the rejection through the alert', () => {
    const {container} = render(
      <InputGroup label="Schedule">
        <InputGroupText>Starts</InputGroupText>
        {nativeField()}
      </InputGroup>,
    );
    const input = getNativeTimeInput();
    fireEvent.change(input, {target: {value: '18:00'}});
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(statusText(container)).toBeNull();
    expect(fieldAlert(container)).toHaveTextContent('Invalid time');
  });

  it('never reports a native rejection through onEntryErrorChange, and keeps the prop and the name on the native input', () => {
    const onEntryErrorChange = vi.fn();
    render(
      nativeField({
        onEntryErrorChange,
        ...({name: 'start'} as object),
      }),
    );
    const input = getNativeTimeInput();
    fireEvent.change(input, {target: {value: '18:00'}});
    fireEvent.blur(input);
    expect(onEntryErrorChange).not.toHaveBeenCalled();
    expect(input).toHaveAttribute('name', 'start');
    expect(input).not.toHaveAttribute('onentryerrorchange');
  });

  it('never reports from the bottom sheet', () => {
    const onEntryErrorChange = vi.fn();
    render(
      <TimeInput
        label="Start time"
        presentation="bottom-sheet"
        value={'09:00' as ISOTimeString}
        onChange={() => {}}
        onEntryErrorChange={onEntryErrorChange}
      />,
    );
    expect(onEntryErrorChange).not.toHaveBeenCalled();
    expect(document.querySelector('[onentryerrorchange]')).toBeNull();
  });
});
