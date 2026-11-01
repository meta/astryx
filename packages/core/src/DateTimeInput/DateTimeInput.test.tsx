// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DateTimeInput.test.tsx
 * @input Uses vitest, @testing-library/react, DateTimeInput component
 * @output Unit tests for DateTimeInput component behavior
 * @position Testing; validates DateTimeInput.tsx implementation
 *
 * SYNC: When DateTimeInput.tsx changes, update tests to match new behavior
 */

import {useState} from 'react';
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {render, screen, fireEvent, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as stylex from '@stylexjs/stylex';
import {colorVars} from '../theme/tokens.stylex';
import {getButton, queryButton} from '../__tests__/fastRoleQueries';
import {DateTimeInput} from './DateTimeInput';
import type {ISODateTimeString} from './DateTimeInput';
import {Icon} from '../Icon';
import {defineTheme} from '../theme/defineTheme';
import {generateThemeCSS} from '../theme/generateThemeRules';
import {InternationalizationProvider} from '../i18n';
import {__resetLiveRegionsForTest} from '../hooks/useAnnounce';

function politeRegion(): HTMLElement | null {
  return document.querySelector('[data-astryx-live-region="polite"]');
}

afterEach(() => {
  __resetLiveRegionsForTest();
});

function generateThemeTestCSS(theme: Parameters<typeof generateThemeCSS>[0]) {
  const {prose, component} = generateThemeCSS(theme);
  return [prose, component].filter(Boolean).join('\n\n');
}

// jsdom does not perform flex layout, so these probe classes verify the
// declarations that switch between horizontal and stacked intrinsic layouts.
const responsiveLayoutProbe = stylex.create({
  responsiveRow: {
    flexWrap: 'wrap',
  },
  responsiveSegment: {
    flexBasis: 196,
    minWidth: 0,
  },
});

function expectResponsiveProbeClasses(
  element: HTMLElement,
  style: (typeof responsiveLayoutProbe)[keyof typeof responsiveLayoutProbe],
): void {
  const classes = (stylex.props(style).className ?? '')
    .split(' ')
    .filter(className => className !== '' && !className.includes('__'));
  expect(classes.length).toBeGreaterThan(0);
  for (const className of classes) {
    expect(element).toHaveClass(className);
  }
}

describe('DateTimeInput', () => {
  it('renders with label', () => {
    render(<DateTimeInput label="Meeting time" onChange={() => {}} />);
    expect(screen.getByLabelText('Meeting time')).toBeInTheDocument();
  });

  it('updates the committed date display when provider locale changes', () => {
    const renderDateTimeInput = (locale: 'en-US' | 'es-ES') => (
      <InternationalizationProvider locale={locale}>
        <DateTimeInput
          label="Meeting"
          value={'2026-01-25T14:30' as ISODateTimeString}
          onChange={() => {}}
        />
      </InternationalizationProvider>
    );
    const {rerender} = render(renderDateTimeInput('en-US'));

    expect(screen.getByRole('combobox')).toHaveValue('January 25, 2026');

    rerender(renderDateTimeInput('es-ES'));
    expect(screen.getByRole('combobox')).toHaveValue('25 de enero de 2026');
  });

  it('derives the time input label from the field label (forms-15)', () => {
    render(<DateTimeInput label="Meeting time" onChange={() => {}} />);
    // Not a hardcoded "Time" — tied to the field label so it is localizable
    // and unambiguous when multiple date-time fields share a page.
    expect(screen.getByLabelText('Meeting time time')).toBeInTheDocument();
    expect(screen.queryByLabelText('Time')).not.toBeInTheDocument();
  });

  it('uses an explicit timeLabel when provided', () => {
    render(
      <DateTimeInput
        label="Meeting time"
        timeLabel="Start time"
        onChange={() => {}}
      />,
    );
    expect(screen.getByLabelText('Start time')).toBeInTheDocument();
  });

  it('renders with placeholder', () => {
    render(
      <DateTimeInput
        label="Time"
        onChange={() => {}}
        placeholder="Pick a date"
      />,
    );
    expect(screen.getByPlaceholderText('Pick a date')).toBeInTheDocument();
  });

  it('defaults the time portion placeholder to "Select a time"', () => {
    render(<DateTimeInput label="Meeting" onChange={() => {}} />);
    expect(screen.getByPlaceholderText('Select a time')).toBeInTheDocument();
  });

  it('applies a custom timePlaceholder to the time portion', () => {
    render(
      <DateTimeInput
        label="Meeting"
        onChange={() => {}}
        placeholder="Pick a date"
        timePlaceholder="Pick a time"
      />,
    );
    // Time portion uses the override; date portion keeps its own placeholder.
    expect(screen.getByPlaceholderText('Pick a time')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Pick a date')).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText('Select a time'),
    ).not.toBeInTheDocument();
  });

  it('renders both date and time inputs', () => {
    render(<DateTimeInput label="Meeting" onChange={() => {}} />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByLabelText('Meeting time')).toBeInTheDocument();
  });

  it('allows the date and time segments to wrap when they no longer fit', () => {
    const {container} = render(
      <DateTimeInput label="Meeting" onChange={() => {}} />,
    );
    const row = container.querySelector(
      '.astryx-date-time-input',
    ) as HTMLElement;
    expect(row).not.toBeNull();
    expectResponsiveProbeClasses(row, responsiveLayoutProbe.responsiveRow);
  });

  it('gives both segments the intrinsic wrap threshold and allows them to shrink', () => {
    const {container} = render(
      <DateTimeInput label="Meeting" onChange={() => {}} />,
    );
    const dateSegment = container.querySelector(
      '.astryx-date-time-input-date-segment',
    ) as HTMLElement;
    const timeSegment = container.querySelector(
      '.astryx-date-time-input-time-segment',
    ) as HTMLElement;
    expectResponsiveProbeClasses(
      dateSegment,
      responsiveLayoutProbe.responsiveSegment,
    );
    expectResponsiveProbeClasses(
      timeSegment,
      responsiveLayoutProbe.responsiveSegment,
    );
  });

  it('does not commit the date on a composing Enter (IME)', () => {
    const onChange = vi.fn();
    render(<DateTimeInput label="Meeting" onChange={onChange} />);
    const dateInput = screen.getByRole('combobox');
    fireEvent.change(dateInput, {target: {value: '03/15/2026'}});
    onChange.mockClear();

    // The composing keydown (isComposing / legacy keyCode 229) that commits an
    // IME candidate must not be read as "commit the typed date".
    fireEvent.keyDown(dateInput, {key: 'Enter', isComposing: true});
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(dateInput, {key: 'Enter', keyCode: 229});
    expect(onChange).not.toHaveBeenCalled();

    // A real, non-composing Enter still commits.
    fireEvent.keyDown(dateInput, {key: 'Enter'});
    expect(onChange).toHaveBeenCalled();
  });

  it('does not step the time on a composing ArrowUp (IME)', () => {
    const onChange = vi.fn();
    render(
      <DateTimeInput
        label="Meeting"
        value={'2026-03-15T14:30' as ISODateTimeString}
        onChange={onChange}
      />,
    );
    const timeInput = screen.getByLabelText('Meeting time');

    // An IME candidate window navigates with the arrows; a composing ArrowUp
    // must not step the time value.
    fireEvent.keyDown(timeInput, {key: 'ArrowUp', isComposing: true});
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(timeInput, {key: 'ArrowUp', keyCode: 229});
    expect(onChange).not.toHaveBeenCalled();

    // A real, non-composing ArrowUp still steps the time by one minute.
    fireEvent.keyDown(timeInput, {key: 'ArrowUp'});
    expect(onChange).toHaveBeenCalledWith('2026-03-15T14:31');
  });

  it('displays formatted date in date input when value is provided', () => {
    render(
      <DateTimeInput
        label="Meeting"
        value={'2026-03-15T14:30' as ISODateTimeString}
        onChange={() => {}}
      />,
    );
    expect(screen.getByDisplayValue('March 15, 2026')).toBeInTheDocument();
  });

  it('displays formatted time in time input when value is provided (12h)', () => {
    render(
      <DateTimeInput
        label="Meeting"
        value={'2026-03-15T14:30' as ISODateTimeString}
        onChange={() => {}}
      />,
    );
    expect(screen.getByDisplayValue('2:30 PM')).toBeInTheDocument();
  });

  it("follows the provider locale's hour cycle when hourFormat is unset", () => {
    const renderIn = (locale: string) => (
      <InternationalizationProvider locale={locale}>
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T14:30' as ISODateTimeString}
          onChange={() => {}}
        />
      </InternationalizationProvider>
    );
    const {rerender} = render(renderIn('en-US'));
    expect(screen.getByDisplayValue('2:30 PM')).toBeInTheDocument();

    rerender(renderIn('de-DE'));
    expect(screen.getByDisplayValue('14:30')).toBeInTheDocument();

    rerender(renderIn('ko-KR'));
    expect(screen.getByDisplayValue('오후 2:30')).toBeInTheDocument();
  });

  it('displays formatted time in 24h format', () => {
    render(
      <DateTimeInput
        label="Meeting"
        value={'2026-03-15T14:30' as ISODateTimeString}
        onChange={() => {}}
        hourFormat="24h"
      />,
    );
    expect(screen.getByDisplayValue('14:30')).toBeInTheDocument();
  });

  it('displays time with seconds', () => {
    render(
      <DateTimeInput
        label="Timestamp"
        value={'2026-03-15T14:30:45' as ISODateTimeString}
        onChange={() => {}}
        hasSeconds
      />,
    );
    expect(screen.getByDisplayValue('2:30:45 PM')).toBeInTheDocument();
  });

  it('forwards ref to date input', () => {
    const ref = vi.fn();
    render(<DateTimeInput ref={ref} label="Meeting" onChange={() => {}} />);
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLInputElement));
  });

  it('visually hides label when isLabelHidden is true', () => {
    render(<DateTimeInput label="Meeting" isLabelHidden onChange={() => {}} />);
    const label = screen.getByText('Meeting');
    expect(label).toBeInTheDocument();
    expect(screen.getByLabelText('Meeting')).toBeInTheDocument();
  });

  it('sets aria-required when isRequired is true', () => {
    render(<DateTimeInput label="Meeting" isRequired onChange={() => {}} />);
    expect(screen.getByRole('combobox')).toHaveAttribute(
      'aria-required',
      'true',
    );
  });

  it('does not set aria-required when isRequired is false', () => {
    render(<DateTimeInput label="Meeting" onChange={() => {}} />);
    expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-required');
  });

  it('keeps both disabled inputs focusable without native disabled (AST-085 FR1)', () => {
    render(<DateTimeInput label="Meeting" isDisabled onChange={() => {}} />);
    for (const input of [
      screen.getByRole('combobox'),
      screen.getByLabelText('Meeting time'),
    ]) {
      expect(input).not.toHaveAttribute('disabled');
      expect(input).toHaveAttribute('aria-disabled', 'true');
      expect(input).toHaveAttribute('readonly');
      input.focus();
      expect(input).toHaveFocus();
    }
  });

  it('restores the focus ring on a focused disabled field (AST-085 FR6)', () => {
    // The same declarations as the field's ring style compile to the same
    // atomic classes; the shared disabled style alone drops them.
    const ringClasses = stylex
      .props(
        stylex.create({
          ring: {
            borderColor: {
              default: colorVars['--color-border-emphasized'],
              ':focus-within': colorVars['--color-accent'],
            },
            boxShadow: {
              default: 'none',
              ':focus-within': `inset 0px 0px 0px 2px ${colorVars['--color-accent-muted']}`,
            },
          },
        }).ring,
      )
      .className!.split(' ')
      .filter(name => !name.includes('__'));
    render(<DateTimeInput label="Meeting" isDisabled onChange={() => {}} />);
    for (const input of [
      screen.getByRole('combobox'),
      screen.getByLabelText('Meeting time'),
    ]) {
      const wrapper = input.closest(
        '.astryx-date-time-input-date-segment, .astryx-date-time-input-time-segment',
      )!;
      for (const name of ringClasses) {
        expect(wrapper).toHaveClass(name);
      }
    }
  });

  it('is not disabled by default', () => {
    render(<DateTimeInput label="Meeting" onChange={() => {}} />);
    expect(screen.getByRole('combobox')).not.toBeDisabled();
    expect(screen.getByLabelText('Meeting time')).not.toBeDisabled();
  });

  it('date input has role="combobox"', () => {
    render(<DateTimeInput label="Meeting" onChange={() => {}} />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('date input has aria-haspopup="dialog"', () => {
    render(<DateTimeInput label="Meeting" onChange={() => {}} />);
    expect(screen.getByRole('combobox')).toHaveAttribute(
      'aria-haspopup',
      'dialog',
    );
  });

  it('date input has aria-expanded=false by default', () => {
    render(<DateTimeInput label="Meeting" onChange={() => {}} />);
    expect(screen.getByRole('combobox')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('opens the calendar popover on ArrowDown (keyboard, forms-13)', () => {
    render(<DateTimeInput label="Meeting" onChange={() => {}} />);
    const input = screen.getByRole('combobox');
    input.focus();
    expect(input).toHaveAttribute('aria-expanded', 'false');
    fireEvent.keyDown(input, {key: 'ArrowDown'});
    expect(input).toHaveAttribute('aria-expanded', 'true');
    // skipAutoFocus keeps focus in the input, per the APG date-picker pattern
    expect(input).toHaveFocus();
  });

  it('opens the calendar popover on Alt+ArrowDown (keyboard, forms-13)', () => {
    render(<DateTimeInput label="Meeting" onChange={() => {}} />);
    const input = screen.getByRole('combobox');
    fireEvent.keyDown(input, {key: 'ArrowDown', altKey: true});
    expect(input).toHaveAttribute('aria-expanded', 'true');
  });

  it('does not open on ArrowDown when disabled', () => {
    render(<DateTimeInput label="Meeting" isDisabled onChange={() => {}} />);
    const input = screen.getByRole('combobox');
    fireEvent.keyDown(input, {key: 'ArrowDown'});
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  it('does not re-trigger on ArrowDown when the calendar is already open', () => {
    render(<DateTimeInput label="Meeting" onChange={() => {}} />);
    const input = screen.getByRole('combobox');
    fireEvent.keyDown(input, {key: 'ArrowDown'});
    expect(input).toHaveAttribute('aria-expanded', 'true');
    // A second ArrowDown is a no-op: the calendar stays open
    fireEvent.keyDown(input, {key: 'ArrowDown'});
    expect(input).toHaveAttribute('aria-expanded', 'true');
  });

  it('calendar button is focusable and clickable', () => {
    render(<DateTimeInput label="Meeting" onChange={() => {}} />);
    const button = getButton('Open calendar');
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it('calendar button is disabled when isDisabled is true', () => {
    render(<DateTimeInput label="Meeting" isDisabled onChange={() => {}} />);
    const button = getButton('Open calendar');
    expect(button).not.toHaveAttribute('disabled');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(button);
    expect(screen.getByRole('combobox')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('disables inputs and button when isLoading is true', () => {
    render(<DateTimeInput label="Meeting" isLoading onChange={() => {}} />);
    for (const el of [
      screen.getByRole('combobox'),
      screen.getByLabelText('Meeting time'),
      getButton('Open calendar'),
    ]) {
      expect(el).not.toHaveAttribute('disabled');
      expect(el).toHaveAttribute('aria-disabled', 'true');
    }
  });

  it('sets aria-busy when isLoading is true', () => {
    render(<DateTimeInput label="Meeting" isLoading onChange={() => {}} />);
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-busy', 'true');
  });

  it('does not set aria-busy when not loading', () => {
    render(<DateTimeInput label="Meeting" onChange={() => {}} />);
    expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-busy');
  });

  it('sets aria-busy on the time input when isLoading is true', () => {
    render(<DateTimeInput label="Meeting" isLoading onChange={() => {}} />);
    expect(screen.getByLabelText('Meeting time')).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });

  it('does not set aria-busy on the time input when not loading', () => {
    render(<DateTimeInput label="Meeting" onChange={() => {}} />);
    expect(screen.getByLabelText('Meeting time')).not.toHaveAttribute(
      'aria-busy',
    );
  });

  it('renders status icon for error status', () => {
    render(
      <DateTimeInput
        label="Meeting"
        onChange={() => {}}
        status={{type: 'error', message: 'Invalid datetime'}}
      />,
    );
    expect(screen.getByRole('combobox')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('does not set aria-invalid for warning status', () => {
    render(
      <DateTimeInput
        label="Meeting"
        onChange={() => {}}
        status={{type: 'warning', message: 'Watch out'}}
      />,
    );
    expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-invalid');
  });

  it('renders description and links via aria-describedby', () => {
    render(
      <DateTimeInput
        label="Meeting"
        description="Pick the meeting datetime"
        onChange={() => {}}
      />,
    );
    const input = screen.getByRole('combobox');
    expect(screen.getByText('Pick the meeting datetime')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-describedby');
  });

  it('links status message via aria-describedby', () => {
    render(
      <DateTimeInput
        label="Meeting"
        onChange={() => {}}
        status={{type: 'error', message: 'Invalid datetime'}}
      />,
    );
    const input = screen.getByRole('combobox');
    const describedBy = input.getAttribute('aria-describedby')!;
    const ids = describedBy.split(' ');
    const found = ids.some(id => {
      const el = document.getElementById(id);
      return el?.textContent?.includes('Invalid datetime');
    });
    expect(found).toBe(true);
  });

  it('links the description to the time input via aria-describedby', () => {
    render(
      <DateTimeInput
        label="Meeting"
        description="Pick the meeting datetime"
        onChange={() => {}}
      />,
    );
    // The description covers both halves of the field, so the time input must
    // carry it too — a screen-reader user tabbing into the time half should
    // not lose the field's description.
    const timeInput = screen.getByLabelText('Meeting time');
    const describedBy = timeInput.getAttribute('aria-describedby')!;
    const ids = describedBy.split(' ');
    const found = ids.some(id =>
      document
        .getElementById(id)
        ?.textContent?.includes('Pick the meeting datetime'),
    );
    expect(found).toBe(true);
  });

  it('links the status message to the time input via aria-describedby', () => {
    render(
      <DateTimeInput
        label="Meeting"
        onChange={() => {}}
        status={{type: 'error', message: 'Invalid datetime'}}
      />,
    );
    const timeInput = screen.getByLabelText('Meeting time');
    const describedBy = timeInput.getAttribute('aria-describedby')!;
    const ids = describedBy.split(' ');
    const found = ids.some(id =>
      document.getElementById(id)?.textContent?.includes('Invalid datetime'),
    );
    expect(found).toBe(true);
  });

  it('links the disabled reason to the time input via aria-describedby', () => {
    HTMLElement.prototype.showPopover = vi.fn();
    HTMLElement.prototype.hidePopover = vi.fn();
    render(
      <DateTimeInput
        label="When"
        onChange={() => {}}
        isDisabled
        disabledMessage="You need the Editor role"
      />,
    );
    const timeInput = screen.getByLabelText('When time');
    const tooltip = screen.getByRole('tooltip', {hidden: true});
    expect(timeInput.getAttribute('aria-describedby')).toContain(tooltip.id);
  });

  it('handles Escape keydown on date input without error', () => {
    render(<DateTimeInput label="Meeting" onChange={() => {}} />);
    const input = screen.getByRole('combobox');
    fireEvent.keyDown(input, {key: 'Escape'});
  });

  // --- Date text input behavior ---

  it('calls onChange when valid date is typed', () => {
    const onChange = vi.fn();
    render(<DateTimeInput label="Meeting" onChange={onChange} />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, {target: {value: '03/15/2026'}});

    expect(onChange).toHaveBeenCalled();
    const calledValue = onChange.mock.calls[0][0] as string;
    expect(calledValue).toMatch(/^2026-03-15T/);
  });

  it('does not call onChange while typing invalid date', () => {
    const onChange = vi.fn();
    render(<DateTimeInput label="Meeting" onChange={onChange} />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, {target: {value: 'invalid'}});

    expect(onChange).not.toHaveBeenCalled();
  });

  it('reverts date input on blur when input is invalid', () => {
    const onChange = vi.fn();
    render(
      <DateTimeInput
        label="Meeting"
        value={'2026-01-25T10:00' as ISODateTimeString}
        onChange={onChange}
      />,
    );

    const input = screen.getByRole('combobox');
    fireEvent.change(input, {target: {value: 'not a date'}});
    fireEvent.blur(input);

    expect(screen.getByDisplayValue('January 25, 2026')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  // --- Time input behavior ---

  it('does not call onChange for time when no date is set', () => {
    const onChange = vi.fn();
    render(<DateTimeInput label="Meeting" onChange={onChange} />);

    const timeInput = screen.getByLabelText('Meeting time');
    fireEvent.change(timeInput, {target: {value: '3:45 pm'}});

    expect(onChange).not.toHaveBeenCalled();
  });

  it('calls onChange for time when date is already set', () => {
    const onChange = vi.fn();
    render(
      <DateTimeInput
        label="Meeting"
        value={'2026-03-15T10:00' as ISODateTimeString}
        onChange={onChange}
      />,
    );

    const timeInput = screen.getByLabelText('Meeting time');
    fireEvent.change(timeInput, {target: {value: '3:45 pm'}});

    expect(onChange).toHaveBeenCalledWith('2026-03-15T15:45');
  });

  it('renders with size="lg"', () => {
    render(
      <DateTimeInput label="Meeting time" onChange={() => {}} size="lg" />,
    );
    expect(screen.getByLabelText('Meeting time')).toBeInTheDocument();
  });

  describe('hasClear', () => {
    it('shows no selected calendar days after clearing', async () => {
      const user = userEvent.setup();

      function ControlledDateTimeInput() {
        const [value, setValue] = useState<ISODateTimeString | undefined>(
          '2026-01-01T09:00' as ISODateTimeString,
        );
        return (
          <DateTimeInput
            label="Meeting"
            value={value}
            onChange={setValue}
            min={'2026-01-01T00:00' as ISODateTimeString}
            max={'2026-01-31T23:59' as ISODateTimeString}
            hasClear
          />
        );
      }

      render(<ControlledDateTimeInput />);
      await user.click(getButton('Open calendar'));
      await user.click(getButton(/January 15, 2026/));
      await user.click(getButton('Clear Meeting'));
      await user.click(getButton('Open calendar'));

      expect(
        screen.queryAllByRole('gridcell', {selected: true, hidden: true}),
      ).toHaveLength(0);
    });

    it('shows clear button when hasClear is true and value exists', () => {
      render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T14:30' as ISODateTimeString}
          onChange={() => {}}
          hasClear
        />,
      );
      expect(getButton('Clear Meeting')).toBeInTheDocument();
    });

    it('does not show clear button when value is undefined', () => {
      render(<DateTimeInput label="Meeting" onChange={() => {}} hasClear />);
      expect(queryButton('Clear Meeting')).not.toBeInTheDocument();
    });

    it('does not show clear button when hasClear is false', () => {
      render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T14:30' as ISODateTimeString}
          onChange={() => {}}
        />,
      );
      expect(queryButton('Clear Meeting')).not.toBeInTheDocument();
    });

    it('does not show clear button when disabled', () => {
      render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T14:30' as ISODateTimeString}
          onChange={() => {}}
          hasClear
          isDisabled
        />,
      );
      expect(queryButton('Clear Meeting')).not.toBeInTheDocument();
    });

    it('calls onChange with undefined when clear is clicked', () => {
      const onChange = vi.fn();
      render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T14:30' as ISODateTimeString}
          onChange={onChange}
          hasClear
        />,
      );
      fireEvent.click(getButton('Clear Meeting'));
      expect(onChange).toHaveBeenCalledWith(undefined);
    });
  });

  describe('external value changes', () => {
    it('clears pending date input when value changes externally', () => {
      const onChange = vi.fn();
      const {rerender} = render(
        <DateTimeInput
          label="Meeting"
          value={'2026-01-15T10:00' as ISODateTimeString}
          onChange={onChange}
        />,
      );

      const dateInput = screen.getByRole('combobox');
      expect(dateInput).toHaveValue('January 15, 2026');

      // User starts typing a new date
      fireEvent.change(dateInput, {target: {value: 'Feb'}});
      expect(dateInput).toHaveValue('Feb');

      // Value changes externally
      rerender(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-20T10:00' as ISODateTimeString}
          onChange={onChange}
        />,
      );

      // Pending input should be cleared, showing the new formatted date
      expect(dateInput).toHaveValue('March 20, 2026');
    });
  });

  describe('invalid typed input feedback (WCAG 3.3.1)', () => {
    it('sets aria-invalid="true" on the date input when typed date is unparseable', () => {
      render(<DateTimeInput label="Meeting" onChange={() => {}} />);

      const dateInput = screen.getByRole('combobox');
      fireEvent.change(dateInput, {target: {value: '13/45/2024'}});

      expect(dateInput).toHaveAttribute('aria-invalid', 'true');
    });

    it('does not set aria-invalid on the date input when typed date is valid', () => {
      render(<DateTimeInput label="Meeting" onChange={() => {}} />);

      const dateInput = screen.getByRole('combobox');
      fireEvent.change(dateInput, {target: {value: '03/15/2026'}});

      expect(dateInput).not.toHaveAttribute('aria-invalid');
    });

    it('announces an alert message when the typed date is invalid', () => {
      render(<DateTimeInput label="Meeting" onChange={() => {}} />);

      const dateInput = screen.getByRole('combobox');
      fireEvent.change(dateInput, {target: {value: '13/45/2024'}});

      expect(screen.getByText('Invalid date')).toBeInTheDocument();
    });

    it('sets aria-invalid="true" on the time input when typed time is unparseable', () => {
      render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T10:00' as ISODateTimeString}
          onChange={() => {}}
        />,
      );

      const timeInput = screen.getByLabelText('Meeting time');
      fireEvent.change(timeInput, {target: {value: '99:99 zz'}});

      expect(timeInput).toHaveAttribute('aria-invalid', 'true');
    });

    it('does not set aria-invalid on the time input when typed time is valid', () => {
      render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T10:00' as ISODateTimeString}
          onChange={() => {}}
        />,
      );

      const timeInput = screen.getByLabelText('Meeting time');
      fireEvent.change(timeInput, {target: {value: '3:45 pm'}});

      expect(timeInput).not.toHaveAttribute('aria-invalid');
    });

    it('announces an alert message when the typed time is invalid', () => {
      render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T10:00' as ISODateTimeString}
          onChange={() => {}}
        />,
      );

      const timeInput = screen.getByLabelText('Meeting time');
      fireEvent.change(timeInput, {target: {value: '99:99 zz'}});

      expect(screen.getByText('Invalid time')).toBeInTheDocument();
    });

    it('resolves the invalid date and time announcements from the i18n catalog', () => {
      render(
        <InternationalizationProvider
          locale="en"
          overrides={{
            en: {
              '@astryx.dateInput.invalidDate': 'Ungültiges Datum',
              '@astryx.timeInput.invalidTime': 'Ungültige Zeit',
            },
          }}>
          <DateTimeInput
            label="Meeting"
            value={'2026-03-15T10:00' as ISODateTimeString}
            onChange={() => {}}
          />
        </InternationalizationProvider>,
      );

      fireEvent.change(screen.getByRole('combobox'), {
        target: {value: '13/45/2024'},
      });
      expect(screen.getByText('Ungültiges Datum')).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText('Meeting time'), {
        target: {value: '99:99 zz'},
      });
      expect(screen.getByText('Ungültige Zeit')).toBeInTheDocument();
    });
  });
  describe('disabledMessage', () => {
    // jsdom does not implement the Popover API used by the tooltip, so mock
    // showPopover/hidePopover to toggle a `popover-open` attribute the tests
    // can assert on.
    beforeEach(() => {
      HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
        this.setAttribute('popover-open', '');
      });
      HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
        this.removeAttribute('popover-open');
      });
    });

    // jsdom popover content is in the DOM but not "visible" in the
    // accessibility tree; use hidden: true to find it.
    const h = {hidden: true} as const;

    it('shows the reason tooltip on hover when disabled with a reason', async () => {
      render(
        <DateTimeInput
          label="When"
          onChange={() => {}}
          isDisabled
          disabledMessage="You need the Editor role"
        />,
      );

      // The tooltip anchors on the outer row that wraps both inputs.
      const dateInput = screen.getByRole('combobox');
      const row = dateInput.parentElement?.parentElement as HTMLElement;
      const tooltip = screen.getByRole('tooltip', h);
      expect(tooltip).toHaveTextContent('You need the Editor role');

      fireEvent.mouseEnter(row);
      await waitFor(() => {
        expect(tooltip).toHaveAttribute('popover-open');
      });

      fireEvent.mouseLeave(row);
      await waitFor(() => {
        expect(tooltip).not.toHaveAttribute('popover-open');
      });
    });

    it('shows the reason tooltip on keyboard focus', async () => {
      const user = userEvent.setup();
      render(
        <DateTimeInput
          label="When"
          onChange={() => {}}
          isDisabled
          disabledMessage="You need the Editor role"
        />,
      );

      const tooltip = screen.getByRole('tooltip', h);
      // The calendar button keeps its enabled tab stop (spec:AST-085 FR1).
      await user.tab();
      expect(getButton('Open calendar')).toHaveFocus();
      expect(
        getButton('Open calendar').getAttribute('aria-describedby'),
      ).toContain(tooltip.id);
      await user.tab();
      expect(screen.getByRole('combobox')).toHaveFocus();
      await waitFor(() => {
        expect(tooltip).toHaveAttribute('popover-open');
      });
    });

    it('does not render a tooltip when not disabled', () => {
      render(
        <DateTimeInput
          label="When"
          onChange={() => {}}
          disabledMessage="You need the Editor role"
        />,
      );
      expect(screen.queryByRole('tooltip', h)).not.toBeInTheDocument();
    });

    it('does not render a tooltip when disabled without a reason', () => {
      render(<DateTimeInput label="When" onChange={() => {}} isDisabled />);
      expect(screen.queryByRole('tooltip', h)).not.toBeInTheDocument();
    });

    it('keeps both inputs focusable via aria-disabled when a reason is provided', () => {
      render(
        <DateTimeInput
          label="When"
          onChange={() => {}}
          isDisabled
          disabledMessage="You need the Editor role"
        />,
      );
      const dateInput = screen.getByRole('combobox');
      const timeInput = screen.getByLabelText('When time');
      expect(dateInput).not.toBeDisabled();
      expect(dateInput).toHaveAttribute('aria-disabled', 'true');
      expect(dateInput).toHaveAttribute('readonly');
      expect(timeInput).not.toBeDisabled();
      expect(timeInput).toHaveAttribute('aria-disabled', 'true');
      expect(timeInput).toHaveAttribute('readonly');
    });

    it('links the reason tooltip from the date input via aria-describedby', () => {
      render(
        <DateTimeInput
          label="When"
          onChange={() => {}}
          isDisabled
          disabledMessage="You need the Editor role"
        />,
      );
      const dateInput = screen.getByRole('combobox');
      const tooltip = screen.getByRole('tooltip', h);
      expect(dateInput.getAttribute('aria-describedby')).toContain(tooltip.id);
    });

    it('blocks value changes and opening while focusable-disabled', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <DateTimeInput
          label="When"
          onChange={onChange}
          isDisabled
          disabledMessage="You need the Editor role"
        />,
      );

      const dateInput = screen.getByRole('combobox');
      await user.click(dateInput);
      await user.type(dateInput, '2026-03-15');
      expect(dateInput).toHaveValue('');
      expect(dateInput).toHaveAttribute('aria-expanded', 'false');
      expect(onChange).not.toHaveBeenCalled();
    });

    it('blocks typing, opening and a caller onClick when disabled without a reason (AST-085 FR2)', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      const onClick = vi.fn();
      render(
        <DateTimeInput
          label="When"
          onChange={onChange}
          onClick={onClick}
          isDisabled
        />,
      );
      const dateInput = screen.getByRole('combobox');
      await user.click(dateInput);
      await user.type(dateInput, '2026-03-15');
      await user.keyboard('{ArrowDown}');
      expect(dateInput).toHaveValue('');
      expect(dateInput).toHaveAttribute('aria-expanded', 'false');
      expect(onChange).not.toHaveBeenCalled();
      expect(onClick).not.toHaveBeenCalled();
    });

    it('drops a date draft instead of committing it when the field becomes disabled (AST-085 FR2)', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      const value = '2026-03-10T09:00' as ISODateTimeString;
      const {rerender} = render(
        <DateTimeInput label="When" value={value} onChange={onChange} />,
      );
      const dateInput = screen.getByRole('combobox');
      await user.click(dateInput);
      await user.clear(dateInput);
      rerender(
        <DateTimeInput
          label="When"
          value={value}
          onChange={onChange}
          isDisabled
        />,
      );
      await user.tab();
      expect(onChange).not.toHaveBeenCalled();
    });

    it('does not swap in the time format-hint placeholder on focus while disabled', () => {
      render(
        <DateTimeInput
          label="When"
          onChange={() => {}}
          isDisabled
          disabledMessage="You need the Editor role"
        />,
      );
      const timeInput = screen.getByLabelText('When time');
      timeInput.focus();
      fireEvent.focus(timeInput);
      expect(timeInput).toHaveAttribute('placeholder', 'Select a time');
    });
  });

  describe('timeIncrement', () => {
    it('steps the time by timeIncrement minutes on ArrowUp', () => {
      const onChange = vi.fn();
      render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T14:30' as ISODateTimeString}
          timeIncrement={15}
          onChange={onChange}
        />,
      );

      const timeInput = screen.getByLabelText('Meeting time');
      fireEvent.keyDown(timeInput, {key: 'ArrowUp'});

      // 14:30 + 15min increment = 14:45
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange.mock.calls[0][0]).toContain('14:45');
    });

    it('defaults to a 1-minute increment', () => {
      const onChange = vi.fn();
      render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T14:30' as ISODateTimeString}
          onChange={onChange}
        />,
      );

      const timeInput = screen.getByLabelText('Meeting time');
      fireEvent.keyDown(timeInput, {key: 'ArrowUp'});

      // 14:30 + default 1min = 14:31
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange.mock.calls[0][0]).toContain('14:31');
    });

    // Arrow-key stepping mutates a plain textbox programmatically, and screen
    // readers do not announce programmatic textbox changes — the new value
    // must be announced through the polite live region (WCAG 4.1.2).
    it('politely announces the new time after ArrowUp stepping', async () => {
      render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T14:30' as ISODateTimeString}
          onChange={() => {}}
        />,
      );

      fireEvent.keyDown(screen.getByLabelText('Meeting time'), {
        key: 'ArrowUp',
      });

      await waitFor(() => {
        expect(politeRegion()).toHaveTextContent('2:31 PM');
      });
    });

    it('announces no step from a disabled time field (AST-085 FR2)', async () => {
      render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T14:30' as ISODateTimeString}
          onChange={() => {}}
          isDisabled
        />,
      );

      fireEvent.keyDown(screen.getByLabelText('Meeting time'), {
        key: 'ArrowUp',
      });

      await new Promise(resolve => setTimeout(resolve, 50));
      expect(politeRegion()?.textContent ?? '').not.toContain('2:31 PM');
    });

    it('politely announces the new time after ArrowDown stepping', async () => {
      render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T14:30' as ISODateTimeString}
          onChange={() => {}}
        />,
      );

      fireEvent.keyDown(screen.getByLabelText('Meeting time'), {
        key: 'ArrowDown',
      });

      await waitFor(() => {
        expect(politeRegion()).toHaveTextContent('2:29 PM');
      });
    });
  });

  // ===========================================================================
  // Time-option dropdown (#2727)
  // ===========================================================================

  describe('timeOptionInterval', () => {
    // The dropdown renders through the same popover as the calendar, so its
    // content lands in the top layer: jsdom keeps the nodes in the DOM but
    // role queries skip them. Read the options off the container directly,
    // exactly as the weekStartsOn tests read columnheaders.
    const optionsIn = (container: HTMLElement): HTMLElement[] =>
      Array.from(container.querySelectorAll('[role="option"]'));

    const labelsIn = (container: HTMLElement): (string | null)[] =>
      optionsIn(container).map(o => o.textContent);

    // ---- opt-in gate --------------------------------------------------------

    it('adds no listbox and no second combobox without timeOptionInterval', () => {
      const {container} = render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T14:30' as ISODateTimeString}
          onChange={() => {}}
        />,
      );

      // The date input stays the only combobox on the field. 30+ existing
      // assertions use the singular getByRole('combobox'); a second one would
      // break every one of them, and every downstream consumer's too.
      expect(screen.getAllByRole('combobox')).toHaveLength(1);

      const timeInput = screen.getByLabelText('Meeting time');
      expect(timeInput).not.toHaveAttribute('role', 'combobox');
      fireEvent.click(timeInput);
      expect(optionsIn(container)).toHaveLength(0);
    });

    // ---- option generation --------------------------------------------------

    it('renders one option per interval step across the day', () => {
      const {container} = render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T14:30' as ISODateTimeString}
          timeOptionInterval={30}
          onChange={() => {}}
        />,
      );

      fireEvent.click(screen.getByLabelText('Meeting time'));
      // A full day at 30-minute cadence.
      expect(optionsIn(container)).toHaveLength(48);
    });

    it('renders 24 options at an hourly interval', () => {
      const {container} = render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T14:30' as ISODateTimeString}
          timeOptionInterval={60}
          onChange={() => {}}
        />,
      );

      fireEvent.click(screen.getByLabelText('Meeting time'));
      const labels = labelsIn(container);
      expect(labels).toHaveLength(24);
      // The 12 AM - 11 PM list the issue asks for.
      expect(labels[0]).toBe('12:00 AM');
      expect(labels[23]).toBe('11:00 PM');
    });

    it('labels options in 24-hour format when hourFormat is 24h', () => {
      const {container} = render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T14:30' as ISODateTimeString}
          timeOptionInterval={60}
          hourFormat="24h"
          onChange={() => {}}
        />,
      );

      fireEvent.click(screen.getByLabelText('Meeting time'));
      const labels = labelsIn(container);
      expect(labels[0]).toBe('00:00');
      expect(labels[13]).toBe('13:00');
    });

    it('includes seconds in option labels when hasSeconds is set', () => {
      const {container} = render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T14:30:00' as ISODateTimeString}
          timeOptionInterval={60}
          hasSeconds
          onChange={() => {}}
        />,
      );

      fireEvent.click(screen.getByLabelText('Meeting time'));
      expect(labelsIn(container)[0]).toBe('12:00:00 AM');
    });

    // ---- committing ---------------------------------------------------------

    it('commits the clicked option and keeps the selected date', () => {
      const onChange = vi.fn();
      const {container} = render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T14:30' as ISODateTimeString}
          timeOptionInterval={60}
          onChange={onChange}
        />,
      );

      fireEvent.click(screen.getByLabelText('Meeting time'));
      // 09:00 is the tenth hourly option.
      fireEvent.click(optionsIn(container)[9]);

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange.mock.calls[0][0]).toBe('2026-03-15T09:00');
    });

    it('marks the committed option as selected, not merely highlighted', () => {
      const {container} = render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T14:00' as ISODateTimeString}
          timeOptionInterval={60}
          onChange={() => {}}
        />,
      );

      fireEvent.click(screen.getByLabelText('Meeting time'));
      const selected = optionsIn(container).filter(
        o => o.getAttribute('aria-selected') === 'true',
      );
      expect(selected).toHaveLength(1);
      expect(selected[0].textContent).toBe('2:00 PM');
    });

    // ---- keyboard: the arrow-key collision ----------------------------------

    it('keeps ArrowUp stepping by timeIncrement while the list is closed', () => {
      const onChange = vi.fn();
      render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T14:30' as ISODateTimeString}
          timeIncrement={15}
          timeOptionInterval={30}
          onChange={onChange}
        />,
      );

      const timeInput = screen.getByLabelText('Meeting time');
      // Closed list: arrows still step the value, as they always have.
      fireEvent.keyDown(timeInput, {key: 'ArrowUp'});

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange.mock.calls[0][0]).toContain('14:45');
      expect(timeInput).toHaveAttribute('aria-expanded', 'false');
    });

    it('opens the list on Alt+ArrowDown without changing the value', () => {
      const onChange = vi.fn();
      const {container} = render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T14:30' as ISODateTimeString}
          timeOptionInterval={30}
          onChange={onChange}
        />,
      );

      const timeInput = screen.getByLabelText('Meeting time');
      fireEvent.keyDown(timeInput, {key: 'ArrowDown', altKey: true});

      expect(timeInput).toHaveAttribute('aria-expanded', 'true');
      expect(onChange).not.toHaveBeenCalled();
      expect(optionsIn(container)).toHaveLength(48);
    });

    it('moves the active option with ArrowDown while open, without committing', () => {
      const onChange = vi.fn();
      const {container} = render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T14:00' as ISODateTimeString}
          timeOptionInterval={60}
          onChange={onChange}
        />,
      );

      const timeInput = screen.getByLabelText('Meeting time');
      fireEvent.keyDown(timeInput, {key: 'ArrowDown', altKey: true});
      // Opening starts the highlight on the committed value (14:00).
      expect(timeInput).toHaveAttribute(
        'aria-activedescendant',
        optionsIn(container)[14].id,
      );

      fireEvent.keyDown(timeInput, {key: 'ArrowDown'});
      expect(timeInput).toHaveAttribute(
        'aria-activedescendant',
        optionsIn(container)[15].id,
      );
      // Navigating is not selecting.
      expect(onChange).not.toHaveBeenCalled();
    });

    it('commits the active option on Enter and closes the list', () => {
      const onChange = vi.fn();
      render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T14:00' as ISODateTimeString}
          timeOptionInterval={60}
          onChange={onChange}
        />,
      );

      const timeInput = screen.getByLabelText('Meeting time');
      fireEvent.keyDown(timeInput, {key: 'ArrowDown', altKey: true});
      fireEvent.keyDown(timeInput, {key: 'ArrowDown'});
      fireEvent.keyDown(timeInput, {key: 'Enter'});

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange.mock.calls[0][0]).toBe('2026-03-15T15:00');
      expect(timeInput).toHaveAttribute('aria-expanded', 'false');
    });

    it('jumps to the first and last option with Home and End', () => {
      const {container} = render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T14:00' as ISODateTimeString}
          timeOptionInterval={60}
          onChange={() => {}}
        />,
      );

      const timeInput = screen.getByLabelText('Meeting time');
      fireEvent.keyDown(timeInput, {key: 'ArrowDown', altKey: true});

      fireEvent.keyDown(timeInput, {key: 'Home'});
      expect(timeInput).toHaveAttribute(
        'aria-activedescendant',
        optionsIn(container)[0].id,
      );

      fireEvent.keyDown(timeInput, {key: 'End'});
      expect(timeInput).toHaveAttribute(
        'aria-activedescendant',
        optionsIn(container)[23].id,
      );
    });

    it('closes on Escape without committing', () => {
      const onChange = vi.fn();
      render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T14:00' as ISODateTimeString}
          timeOptionInterval={60}
          onChange={onChange}
        />,
      );

      const timeInput = screen.getByLabelText('Meeting time');
      fireEvent.keyDown(timeInput, {key: 'ArrowDown', altKey: true});
      fireEvent.keyDown(timeInput, {key: 'ArrowDown'});
      fireEvent.keyDown(timeInput, {key: 'Escape'});

      expect(timeInput).toHaveAttribute('aria-expanded', 'false');
      expect(onChange).not.toHaveBeenCalled();
    });

    // ---- typed entry keeps working -----------------------------------------

    it('moves the highlight to the closest option as the user types, without dropping options', () => {
      const {container} = render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T14:00' as ISODateTimeString}
          timeOptionInterval={60}
          onChange={() => {}}
        />,
      );

      const timeInput = screen.getByLabelText('Meeting time');
      fireEvent.click(timeInput);
      fireEvent.change(timeInput, {target: {value: '9:00 PM'}});

      // Free-form entry is the contract here: the list narrows nothing, it
      // follows the typed value so Enter still lands on something sensible.
      expect(optionsIn(container)).toHaveLength(24);
      expect(timeInput).toHaveAttribute(
        'aria-activedescendant',
        optionsIn(container)[21].id,
      );
    });

    // ---- constraints --------------------------------------------------------

    it('drops options outside min/max on the boundary date', () => {
      const {container} = render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T14:00' as ISODateTimeString}
          min={'2026-03-15T09:00' as ISODateTimeString}
          max={'2026-03-15T17:00' as ISODateTimeString}
          timeOptionInterval={60}
          onChange={() => {}}
        />,
      );

      fireEvent.click(screen.getByLabelText('Meeting time'));
      const labels = labelsIn(container);
      // 09:00 through 17:00 inclusive.
      expect(labels).toHaveLength(9);
      expect(labels[0]).toBe('9:00 AM');
      expect(labels[8]).toBe('5:00 PM');
    });

    it('offers the whole day when the selected date is inside the min/max range', () => {
      const {container} = render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-16T14:00' as ISODateTimeString}
          min={'2026-03-15T09:00' as ISODateTimeString}
          max={'2026-03-17T17:00' as ISODateTimeString}
          timeOptionInterval={60}
          onChange={() => {}}
        />,
      );

      fireEvent.click(screen.getByLabelText('Meeting time'));
      // The time bound only bites on the boundary date itself.
      expect(optionsIn(container)).toHaveLength(24);
    });

    // ---- a11y wiring + disabled --------------------------------------------

    it('wires the time input as a combobox onto the listbox', () => {
      const {container} = render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T14:00' as ISODateTimeString}
          timeOptionInterval={60}
          onChange={() => {}}
        />,
      );

      const timeInput = screen.getByLabelText('Meeting time');
      expect(timeInput).toHaveAttribute('role', 'combobox');
      expect(timeInput).toHaveAttribute('aria-expanded', 'false');
      expect(timeInput).toHaveAttribute('aria-autocomplete', 'list');

      fireEvent.click(timeInput);
      const listbox = container.querySelector('[role="listbox"]');
      expect(listbox).not.toBeNull();
      expect(timeInput).toHaveAttribute('aria-controls', listbox?.id);
      // Named, so the list is not an anonymous group to a screen reader.
      expect(listbox).toHaveAttribute('aria-label');
    });

    it('highlights on hover without scrolling, keyboard still scrolls (#6077)', () => {
      // Hover must highlight only: scrollIntoView under a stationary pointer
      // moves the next option under it, re-highlighting and scrolling again —
      // a runaway auto-scroll loop with no user input.
      const scrollIntoView = vi.fn();
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        value: scrollIntoView,
      });
      try {
        const {container} = render(
          <DateTimeInput
            label="Meeting"
            value={'2026-03-15T14:00' as ISODateTimeString}
            timeOptionInterval={60}
            onChange={() => {}}
          />,
        );

        const timeInput = screen.getByLabelText('Meeting time');
        fireEvent.click(timeInput);
        scrollIntoView.mockClear();

        const options = container
          .querySelector('[role="listbox"]')!
          .querySelectorAll('[role="option"]');
        fireEvent.mouseEnter(options[5]);

        expect(timeInput.getAttribute('aria-activedescendant')).toBe(
          options[5].id,
        );
        expect(scrollIntoView).not.toHaveBeenCalled();

        fireEvent.keyDown(timeInput, {key: 'ArrowDown'});
        expect(scrollIntoView).toHaveBeenCalledWith({block: 'nearest'});
      } finally {
        delete (HTMLElement.prototype as unknown as {scrollIntoView?: unknown})
          .scrollIntoView;
      }
    });

    it('does not open the list when disabled', () => {
      render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T14:00' as ISODateTimeString}
          timeOptionInterval={60}
          isDisabled
          onChange={() => {}}
        />,
      );

      const timeInput = screen.getByLabelText('Meeting time');
      fireEvent.click(timeInput);
      fireEvent.keyDown(timeInput, {key: 'ArrowDown', altKey: true});

      // The layer mounts its content whether or not it is open — visibility is
      // the popover attribute's job, which jsdom does not apply. So assert the
      // open state itself, not the presence of option nodes.
      expect(timeInput).toHaveAttribute('aria-expanded', 'false');
      expect(timeInput).not.toHaveAttribute('aria-controls');
    });

    it('does not open the list for a focusable-disabled field', () => {
      // With disabledMessage the input drops the native `disabled` attribute so
      // the reason stays discoverable, which means clicks and keys really do
      // reach it. This is the case the guards have to catch — a natively
      // disabled input never delivers the events in the first place.
      render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T14:00' as ISODateTimeString}
          timeOptionInterval={60}
          isDisabled
          disabledMessage="Pick a project first"
          onChange={() => {}}
        />,
      );

      const timeInput = screen.getByLabelText('Meeting time');
      expect(timeInput).not.toBeDisabled();

      fireEvent.click(timeInput);
      expect(timeInput).toHaveAttribute('aria-expanded', 'false');

      fireEvent.keyDown(timeInput, {key: 'ArrowDown', altKey: true});
      expect(timeInput).toHaveAttribute('aria-expanded', 'false');
    });

    // -- edge cases ----------------------------------------------------------

    it('does not fire a change when the already-selected option is clicked', () => {
      // The marker compares a seconds-normalised time while the commit path
      // compared the raw one, so with a stray-seconds value the option that
      // renders as selected still emitted a change when clicked.
      const onChange = vi.fn();
      const {container} = render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T14:00:00' as ISODateTimeString}
          timeOptionInterval={60}
          onChange={onChange}
        />,
      );

      const timeInput = screen.getByLabelText('Meeting time');
      fireEvent.click(timeInput);
      const selected = optionsIn(container).find(
        o => o.getAttribute('aria-selected') === 'true',
      );
      expect(selected).toBeDefined();

      fireEvent.click(selected as HTMLElement);

      expect(onChange).not.toHaveBeenCalled();
      expect(timeInput).toHaveAttribute('aria-expanded', 'false');
    });

    it('does not open an empty list when min/max leave no valid option', () => {
      // A window narrower than the cadence survives no option at all. Opening
      // then shows a blank popover with nothing to pick.
      render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T09:15' as ISODateTimeString}
          min={'2026-03-15T09:10' as ISODateTimeString}
          max={'2026-03-15T09:20' as ISODateTimeString}
          timeOptionInterval={30}
          onChange={() => {}}
        />,
      );

      const timeInput = screen.getByLabelText('Meeting time');
      fireEvent.click(timeInput);
      expect(timeInput).toHaveAttribute('aria-expanded', 'false');

      fireEvent.keyDown(timeInput, {key: 'ArrowDown', altKey: true});
      expect(timeInput).toHaveAttribute('aria-expanded', 'false');
    });

    it('commits the active option on Enter once the user arrows away from what they typed', () => {
      // Typed text beats the highlight only while the highlight is still the
      // one typing derived. After an arrow key the highlight is the user's own
      // choice, and Enter must honour what the field says is active.
      const onChange = vi.fn();
      const {container} = render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T09:00' as ISODateTimeString}
          timeOptionInterval={60}
          onChange={onChange}
        />,
      );

      const timeInput = screen.getByLabelText('Meeting time');
      fireEvent.click(timeInput);
      fireEvent.change(timeInput, {target: {value: '9:15 AM'}});
      fireEvent.keyDown(timeInput, {key: 'ArrowDown'});
      fireEvent.keyDown(timeInput, {key: 'ArrowDown'});

      expect(timeInput).toHaveAttribute(
        'aria-activedescendant',
        optionsIn(container)[11].id,
      );

      fireEvent.keyDown(timeInput, {key: 'Enter'});
      expect(onChange.mock.calls[onChange.mock.calls.length - 1][0]).toBe(
        '2026-03-15T11:00',
      );
    });

    it('closes a list that empties underneath it', () => {
      // The open-time guard cannot help here: the window narrows after the
      // list is already up. Left open, the keyboard switch is gated off and
      // the arrows fall back to stepping a value the user cannot see.
      const onChange = vi.fn();
      const {container, rerender} = render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-16T14:00' as ISODateTimeString}
          min={'2026-03-15T09:10' as ISODateTimeString}
          max={'2026-03-15T09:20' as ISODateTimeString}
          timeOptionInterval={60}
          onChange={onChange}
        />,
      );

      const timeInput = screen.getByLabelText('Meeting time');
      fireEvent.click(timeInput);
      expect(timeInput).toHaveAttribute('aria-expanded', 'true');

      rerender(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T09:15' as ISODateTimeString}
          min={'2026-03-15T09:10' as ISODateTimeString}
          max={'2026-03-15T09:20' as ISODateTimeString}
          timeOptionInterval={60}
          onChange={onChange}
        />,
      );

      expect(optionsIn(container)).toHaveLength(0);
      expect(timeInput).toHaveAttribute('aria-expanded', 'false');
    });

    it('closes the list when focus leaves the field entirely', () => {
      // Light dismiss covers outside clicks and Escape, never a programmatic
      // focus move. Without this the listbox is orphaned in the top layer.
      render(
        <>
          <DateTimeInput
            label="Meeting"
            value={'2026-03-15T14:00' as ISODateTimeString}
            timeOptionInterval={60}
            onChange={() => {}}
          />
          <button type="button">after</button>
        </>,
      );

      const timeInput = screen.getByLabelText('Meeting time');
      fireEvent.keyDown(timeInput, {key: 'ArrowDown', altKey: true});
      expect(timeInput).toHaveAttribute('aria-expanded', 'true');

      fireEvent.blur(timeInput, {relatedTarget: getButton('after')});
      expect(timeInput).toHaveAttribute('aria-expanded', 'false');
    });

    it('closes an open list when the field goes busy', () => {
      const {rerender} = render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T09:00' as ISODateTimeString}
          timeOptionInterval={60}
          onChange={() => {}}
        />,
      );

      const timeInput = screen.getByLabelText('Meeting time');
      fireEvent.click(timeInput);
      expect(timeInput).toHaveAttribute('aria-expanded', 'true');

      rerender(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T09:00' as ISODateTimeString}
          timeOptionInterval={60}
          isLoading
          onChange={() => {}}
        />,
      );

      // An open dropdown over a control that no longer takes input.
      expect(timeInput).toHaveAttribute('aria-expanded', 'false');
    });

    it('scales option padding with the field size', () => {
      const small = render(
        <DateTimeInput
          label="Small"
          value={'2026-03-15T09:00' as ISODateTimeString}
          timeOptionInterval={60}
          size="sm"
          onChange={() => {}}
        />,
      );
      fireEvent.click(screen.getByLabelText('Small time'));
      const smallClass = optionsIn(small.container)[0].className;
      small.unmount();

      const large = render(
        <DateTimeInput
          label="Large"
          value={'2026-03-15T09:00' as ISODateTimeString}
          timeOptionInterval={60}
          size="lg"
          onChange={() => {}}
        />,
      );
      fireEvent.click(screen.getByLabelText('Large time'));
      const largeClass = optionsIn(large.container)[0].className;

      // Rows that ignore size leave an sm field with md-sized options.
      expect(smallClass).not.toBe(largeClass);
    });

    it('commits the typed time on Enter, not the option below it', () => {
      // Typing is free-form, so Enter must not quietly round 1:07 PM down to
      // the 1:00 PM option the highlight is resting on.
      const onChange = vi.fn();
      render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T09:00' as ISODateTimeString}
          timeOptionInterval={60}
          onChange={onChange}
        />,
      );

      const timeInput = screen.getByLabelText('Meeting time');
      fireEvent.click(timeInput);
      fireEvent.change(timeInput, {target: {value: '1:07 PM'}});
      fireEvent.keyDown(timeInput, {key: 'Enter'});

      const last = onChange.mock.calls[onChange.mock.calls.length - 1][0];
      expect(last).toBe('2026-03-15T13:07');
      expect(timeInput).toHaveAttribute('aria-expanded', 'false');
    });

    it('names the list after timeLabel when one is given', () => {
      const {container} = render(
        <DateTimeInput
          label="Meeting"
          timeLabel="Start time"
          value={'2026-03-15T09:00' as ISODateTimeString}
          timeOptionInterval={60}
          onChange={() => {}}
        />,
      );

      fireEvent.click(screen.getByLabelText('Start time'));
      // The list belongs to the field the consumer renamed, so it must not
      // announce itself under the old one.
      expect(container.querySelector('[role="listbox"]')).toHaveAttribute(
        'aria-label',
        'Start time options',
      );
    });

    it('opens from the keyboard after a pointer press that never became a click', () => {
      // The show is deferred past an in-flight click so light-dismiss cannot
      // eat it. A press that ends without a click must not wedge that flag.
      render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T09:00' as ISODateTimeString}
          timeOptionInterval={60}
          onChange={() => {}}
        />,
      );

      const timeInput = screen.getByLabelText('Meeting time');
      fireEvent.pointerDown(timeInput);
      fireEvent.keyDown(timeInput, {key: 'ArrowDown', altKey: true});

      expect(timeInput).toHaveAttribute('aria-expanded', 'true');
    });

    it('activates the first option when the field has a date but no time', () => {
      // The state you land in after picking a date and no time yet. With no
      // active option, ArrowUp and Enter both did nothing at all.
      const onChange = vi.fn();
      const {container} = render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15' as ISODateTimeString}
          timeOptionInterval={60}
          onChange={onChange}
        />,
      );

      const timeInput = screen.getByLabelText('Meeting time');
      fireEvent.click(timeInput);

      expect(timeInput).toHaveAttribute(
        'aria-activedescendant',
        optionsIn(container)[0].id,
      );

      // ArrowUp on the first option is a no-op, not a dead end.
      fireEvent.keyDown(timeInput, {key: 'ArrowUp'});
      expect(timeInput).toHaveAttribute(
        'aria-activedescendant',
        optionsIn(container)[0].id,
      );

      fireEvent.keyDown(timeInput, {key: 'Enter'});
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange.mock.calls[0][0]).toBe('2026-03-15T00:00');
    });

    it('keeps the active option valid when the list shrinks while open', () => {
      const {container, rerender} = render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T14:00' as ISODateTimeString}
          timeOptionInterval={5}
          onChange={() => {}}
        />,
      );

      const timeInput = screen.getByLabelText('Meeting time');
      fireEvent.keyDown(timeInput, {key: 'ArrowDown', altKey: true});
      fireEvent.keyDown(timeInput, {key: 'End'});
      expect(optionsIn(container)).toHaveLength(288);

      // The cadence widens under the open list, so the old index is far past
      // the end. A stale index leaves the user with no visible highlight and
      // arrow keys that appear dead until they walk it back into range.
      rerender(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T14:00' as ISODateTimeString}
          timeOptionInterval={60}
          onChange={() => {}}
        />,
      );

      const options = optionsIn(container);
      expect(options).toHaveLength(24);
      expect(timeInput).toHaveAttribute(
        'aria-activedescendant',
        options[23].id,
      );
    });

    it('handles a min/max window that leaves exactly one option', () => {
      const onChange = vi.fn();
      const {container} = render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T09:20' as ISODateTimeString}
          min={'2026-03-15T09:00' as ISODateTimeString}
          max={'2026-03-15T09:30' as ISODateTimeString}
          timeOptionInterval={60}
          onChange={onChange}
        />,
      );

      const timeInput = screen.getByLabelText('Meeting time');
      fireEvent.click(timeInput);

      const options = optionsIn(container);
      expect(options).toHaveLength(1);
      expect(options[0].textContent).toBe('9:00 AM');

      // Every clamp expression collapses at length 1.
      fireEvent.keyDown(timeInput, {key: 'ArrowDown'});
      fireEvent.keyDown(timeInput, {key: 'ArrowUp'});
      fireEvent.keyDown(timeInput, {key: 'End'});
      expect(timeInput).toHaveAttribute('aria-activedescendant', options[0].id);

      fireEvent.keyDown(timeInput, {key: 'Enter'});
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange.mock.calls[0][0]).toBe('2026-03-15T09:00');
    });

    it('labels midnight and noon correctly in 12-hour format', () => {
      // 00:00 and 12:00 are where 12-hour formatting classically goes wrong.
      const {container} = render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T14:00' as ISODateTimeString}
          timeOptionInterval={60}
          onChange={() => {}}
        />,
      );

      fireEvent.click(screen.getByLabelText('Meeting time'));
      const labels = labelsIn(container);
      expect(labels[0]).toBe('12:00 AM');
      expect(labels[12]).toBe('12:00 PM');
      expect(labels[11]).toBe('11:00 AM');
      expect(labels[13]).toBe('1:00 PM');
    });

    it('highlights the nearest earlier option for a value off the cadence', () => {
      const {container} = render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T14:07' as ISODateTimeString}
          timeOptionInterval={30}
          onChange={() => {}}
        />,
      );

      const timeInput = screen.getByLabelText('Meeting time');
      fireEvent.click(timeInput);

      // 14:07 sits between 14:00 (index 28) and 14:30.
      expect(timeInput).toHaveAttribute(
        'aria-activedescendant',
        optionsIn(container)[28].id,
      );
      // ...and nothing claims to be the selected value.
      expect(
        optionsIn(container).filter(
          o => o.getAttribute('aria-selected') === 'true',
        ),
      ).toHaveLength(0);
    });

    it('highlights the first option for a value below the whole range', () => {
      const {container} = render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T06:00' as ISODateTimeString}
          min={'2026-03-15T09:00' as ISODateTimeString}
          timeOptionInterval={60}
          onChange={() => {}}
        />,
      );

      const timeInput = screen.getByLabelText('Meeting time');
      fireEvent.click(timeInput);

      expect(timeInput).toHaveAttribute(
        'aria-activedescendant',
        optionsIn(container)[0].id,
      );
      expect(labelsIn(container)[0]).toBe('9:00 AM');
    });

    it('clamps the active option at both ends of the list', () => {
      const {container} = render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T00:00' as ISODateTimeString}
          timeOptionInterval={60}
          onChange={() => {}}
        />,
      );

      const timeInput = screen.getByLabelText('Meeting time');
      fireEvent.keyDown(timeInput, {key: 'ArrowDown', altKey: true});

      // Already on the first option: ArrowUp must not wrap to the last.
      fireEvent.keyDown(timeInput, {key: 'ArrowUp'});
      expect(timeInput).toHaveAttribute(
        'aria-activedescendant',
        optionsIn(container)[0].id,
      );

      fireEvent.keyDown(timeInput, {key: 'End'});
      fireEvent.keyDown(timeInput, {key: 'ArrowDown'});
      expect(timeInput).toHaveAttribute(
        'aria-activedescendant',
        optionsIn(container)[23].id,
      );
    });

    it('leaves Escape alone while the list is closed', () => {
      // Swallowing Escape here would stop an enclosing Dialog from closing.
      render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T14:00' as ISODateTimeString}
          timeOptionInterval={60}
          onChange={() => {}}
        />,
      );

      const timeInput = screen.getByLabelText('Meeting time');
      // fireEvent returns false when the event was cancelled.
      expect(fireEvent.keyDown(timeInput, {key: 'Escape'})).toBe(true);
    });

    it('closes the list on Tab without blocking focus from leaving', () => {
      render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T14:00' as ISODateTimeString}
          timeOptionInterval={60}
          onChange={() => {}}
        />,
      );

      const timeInput = screen.getByLabelText('Meeting time');
      fireEvent.keyDown(timeInput, {key: 'ArrowDown', altKey: true});
      expect(timeInput).toHaveAttribute('aria-expanded', 'true');

      // Not cancelled, so the browser still moves focus to the next control.
      expect(fireEvent.keyDown(timeInput, {key: 'Tab'})).toBe(true);
      expect(timeInput).toHaveAttribute('aria-expanded', 'false');
    });

    it('picking a time with no date selected changes nothing', () => {
      // Documents the component's existing contract: every time-commit path
      // requires a date, so the list cannot invent one.
      const onChange = vi.fn();
      const {container} = render(
        <DateTimeInput
          label="Meeting"
          timeOptionInterval={60}
          onChange={onChange}
        />,
      );

      const timeInput = screen.getByLabelText('Meeting time');
      fireEvent.click(timeInput);
      expect(timeInput).toHaveAttribute('aria-expanded', 'true');

      fireEvent.click(optionsIn(container)[9]);

      // The click IS handled — the list closes — it just cannot produce a
      // datetime without a date, so no change is emitted and the field stays
      // empty rather than showing a time that was never committed.
      expect(timeInput).toHaveAttribute('aria-expanded', 'false');
      expect(onChange).not.toHaveBeenCalled();
      expect(timeInput).toHaveValue('');
    });

    it('does not open the list while a change is in flight', () => {
      render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T14:00' as ISODateTimeString}
          timeOptionInterval={60}
          isLoading
          onChange={() => {}}
        />,
      );

      const timeInput = screen.getByLabelText('Meeting time');
      fireEvent.click(timeInput);
      fireEvent.keyDown(timeInput, {key: 'ArrowDown', altKey: true});

      expect(timeInput).toHaveAttribute('aria-expanded', 'false');
    });

    it('commits seconds in the value when hasSeconds is set', () => {
      const onChange = vi.fn();
      const {container} = render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T14:00:00' as ISODateTimeString}
          timeOptionInterval={60}
          hasSeconds
          onChange={onChange}
        />,
      );

      fireEvent.click(screen.getByLabelText('Meeting time'));
      fireEvent.click(optionsIn(container)[9]);

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange.mock.calls[0][0]).toBe('2026-03-15T09:00:00');
    });

    it('keeps two fields on one page independent', () => {
      const {container} = render(
        <>
          <DateTimeInput
            label="Starts"
            value={'2026-03-15T09:00' as ISODateTimeString}
            timeOptionInterval={60}
            onChange={() => {}}
          />
          <DateTimeInput
            label="Ends"
            value={'2026-03-15T17:00' as ISODateTimeString}
            timeOptionInterval={60}
            onChange={() => {}}
          />
        </>,
      );

      const starts = screen.getByLabelText('Starts time');
      const ends = screen.getByLabelText('Ends time');

      fireEvent.click(starts);
      expect(starts).toHaveAttribute('aria-expanded', 'true');
      expect(ends).toHaveAttribute('aria-expanded', 'false');

      const listboxes = container.querySelectorAll('[role="listbox"]');
      expect(listboxes).toHaveLength(1);
      // Option ids must not collide between instances.
      const ids = optionsIn(container).map(o => o.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(starts.getAttribute('aria-controls')).toBe(listboxes[0].id);
    });

    it('mounts no option nodes until the list is opened', () => {
      // The layer renders its children whether open or closed, so an
      // unconditional list would park a day's worth of divs in the DOM of
      // every opted-in field. At a 5-minute cadence that is 288 nodes.
      const {container} = render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T14:00' as ISODateTimeString}
          timeOptionInterval={5}
          onChange={() => {}}
        />,
      );

      expect(optionsIn(container)).toHaveLength(0);
      expect(container.querySelector('[role="listbox"]')).toBeNull();

      fireEvent.click(screen.getByLabelText('Meeting time'));
      expect(optionsIn(container)).toHaveLength(288);
    });

    it('marks the selected option when the value carries unwanted seconds', () => {
      // splitDateTime slices the string after the T, so an external value of
      // 14:00:00 with hasSeconds off leaves valueParts.time as "14:00:00"
      // while every option is "14:00". A raw equality check silently marks
      // nothing selected.
      const {container} = render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T14:00:00' as ISODateTimeString}
          timeOptionInterval={60}
          onChange={() => {}}
        />,
      );

      fireEvent.click(screen.getByLabelText('Meeting time'));
      const selected = optionsIn(container).filter(
        o => o.getAttribute('aria-selected') === 'true',
      );
      expect(selected).toHaveLength(1);
      expect(selected[0].textContent).toBe('2:00 PM');
    });

    it('keeps focus in the time field when opening evicts the calendar', () => {
      // Both layers are popover="auto", so showing the time list closes the
      // calendar. The calendar's onHide returns focus to the date input —
      // which would rip focus out of the field the user is working in.
      render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T14:00' as ISODateTimeString}
          timeOptionInterval={60}
          onChange={() => {}}
        />,
      );

      const dateInput = screen.getAllByRole('combobox')[0];
      const timeInput = screen.getByLabelText('Meeting time');

      fireEvent.keyDown(dateInput, {key: 'ArrowDown'});
      expect(dateInput).toHaveAttribute('aria-expanded', 'true');

      timeInput.focus();
      fireEvent.keyDown(timeInput, {key: 'ArrowDown', altKey: true});

      expect(timeInput).toHaveAttribute('aria-expanded', 'true');
      expect(timeInput).toHaveFocus();
    });

    it('starts closed and opens only when asked', () => {
      render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T14:00' as ISODateTimeString}
          timeOptionInterval={60}
          onChange={() => {}}
        />,
      );

      const timeInput = screen.getByLabelText('Meeting time');
      expect(timeInput).toHaveAttribute('aria-expanded', 'false');
      expect(timeInput).not.toHaveAttribute('aria-activedescendant');

      fireEvent.click(timeInput);
      expect(timeInput).toHaveAttribute('aria-expanded', 'true');
    });
  });

  describe('calendar while the popover is closed', () => {
    const calendarGrid = () => document.querySelector('[role="grid"]');

    it('renders no calendar until the popover opens, and none after it closes', () => {
      render(
        <DateTimeInput
          label="Meeting"
          value={'2026-01-15T10:00' as ISODateTimeString}
          onChange={() => {}}
        />,
      );
      const toggle = getButton('Open calendar');
      expect(calendarGrid()).toBeNull();

      fireEvent.click(toggle);
      expect(calendarGrid()).not.toBeNull();

      fireEvent.click(toggle);
      expect(calendarGrid()).toBeNull();
    });

    it('opens on the month of a date typed while closed', () => {
      function Controlled() {
        const [value, setValue] = useState<ISODateTimeString | undefined>(
          '2026-01-15T10:00' as ISODateTimeString,
        );
        return (
          <DateTimeInput label="Meeting" value={value} onChange={setValue} />
        );
      }
      render(<Controlled />);
      const dateInput = screen.getAllByRole('combobox')[0];

      fireEvent.change(dateInput, {target: {value: 'March 5, 2027'}});
      fireEvent.keyDown(dateInput, {key: 'ArrowDown'});

      expect(calendarGrid()).toHaveAccessibleName('March 2027');
    });

    it('moves focus into the calendar on each open from the toggle', async () => {
      render(
        <DateTimeInput
          label="Meeting"
          value={'2026-01-15T10:00' as ISODateTimeString}
          onChange={() => {}}
        />,
      );
      const toggle = getButton('Open calendar');

      for (let i = 0; i < 2; i++) {
        fireEvent.click(toggle);
        // The first calendar control takes focus, not the dialog surface.
        await waitFor(() => {
          expect(getButton('Previous month')).toHaveFocus();
        });
        fireEvent.click(toggle);
        expect(calendarGrid()).toBeNull();
      }
    });
  });

  describe('weekStartsOn', () => {
    // The calendar popover renders in the top layer; jsdom keeps the content in
    // the DOM but role queries skip it, so read the columnheaders directly.
    const openAndReadWeekdays = (container: HTMLElement): (string | null)[] => {
      fireEvent.keyDown(screen.getAllByRole('combobox')[0], {key: 'ArrowDown'});
      return Array.from(container.querySelectorAll('[role="columnheader"]'))
        .slice(0, 7)
        .map(h => h.textContent);
    };

    it('defaults to a Sunday-first week', () => {
      const {container} = render(
        <DateTimeInput label="When" onChange={() => {}} />,
      );
      expect(openAndReadWeekdays(container)).toEqual([
        'Su',
        'Mo',
        'Tu',
        'We',
        'Th',
        'Fr',
        'Sa',
      ]);
    });

    it('forwards a numeric weekStartsOn to the calendar', () => {
      const {container} = render(
        <DateTimeInput label="When" onChange={() => {}} weekStartsOn={1} />,
      );
      expect(openAndReadWeekdays(container)).toEqual([
        'Mo',
        'Tu',
        'We',
        'Th',
        'Fr',
        'Sa',
        'Su',
      ]);
    });

    it('accepts a three-letter day name', () => {
      const {container} = render(
        <DateTimeInput label="When" onChange={() => {}} weekStartsOn="mon" />,
      );
      expect(openAndReadWeekdays(container)).toEqual([
        'Mo',
        'Tu',
        'We',
        'Th',
        'Fr',
        'Sa',
        'Su',
      ]);
    });
  });
  // ===========================================================================
  // Segment theme targets (#4075)
  // ===========================================================================

  describe('segment theme targets', () => {
    // The root only publishes `astryx-date-time-input`; the date and time
    // wrappers were anonymous nodes carrying hashed atomic classes only, so a
    // theme that restyles input geometry through the text-input/date-input/
    // time-input targets could not reach them and DateTimeInput rendered
    // shorter than every other input under that theme.

    it('renders the date segment target on the date wrapper', () => {
      render(<DateTimeInput label="Meeting" onChange={() => {}} />);
      const wrapper = screen
        .getByLabelText('Meeting')
        .closest('.astryx-date-time-input-date-segment');

      expect(wrapper).not.toBeNull();
      // The wrapper is the input's own container, not an ancestor further up.
      expect(wrapper).toBe(screen.getByLabelText('Meeting').parentElement);
    });

    it('renders the time segment target on the time wrapper', () => {
      render(<DateTimeInput label="Meeting" onChange={() => {}} />);
      const wrapper = screen
        .getByLabelText('Meeting time')
        .closest('.astryx-date-time-input-time-segment');

      expect(wrapper).not.toBeNull();
      expect(wrapper).toBe(screen.getByLabelText('Meeting time').parentElement);
    });

    it('reflects size on both segments so themes can restyle geometry', () => {
      render(<DateTimeInput label="Meeting" size="lg" onChange={() => {}} />);

      const date = screen
        .getByLabelText('Meeting')
        .closest('.astryx-date-time-input-date-segment');
      const time = screen
        .getByLabelText('Meeting time')
        .closest('.astryx-date-time-input-time-segment');

      expect(date).toHaveAttribute('data-size', 'lg');
      expect(time).toHaveAttribute('data-size', 'lg');
    });

    it('reflects status on both segments, mirroring the root', () => {
      render(
        <DateTimeInput
          label="Meeting"
          status={{type: 'error', message: 'Required'}}
          onChange={() => {}}
        />,
      );

      const date = screen
        .getByLabelText('Meeting')
        .closest('.astryx-date-time-input-date-segment');
      const time = screen
        .getByLabelText('Meeting time')
        .closest('.astryx-date-time-input-time-segment');

      expect(date).toHaveAttribute('data-status', 'error');
      expect(time).toHaveAttribute('data-status', 'error');
    });

    it('omits data-status when there is no status, like the root does', () => {
      render(<DateTimeInput label="Meeting" onChange={() => {}} />);

      const date = screen
        .getByLabelText('Meeting')
        .closest('.astryx-date-time-input-date-segment');

      expect(date).not.toHaveAttribute('data-status');
    });

    it('keeps the root target intact', () => {
      const {container} = render(
        <DateTimeInput label="Meeting" onChange={() => {}} />,
      );
      // Additive change — the existing root target still renders.
      expect(container.querySelector('.astryx-date-time-input')).not.toBeNull();
    });

    it('exposes both segments as themeable defineTheme targets', () => {
      // jsdom cannot resolve the @layer cascade, so the generated CSS is what
      // proves a theme can actually reach these nodes.
      const theme = defineTheme({
        name: 'date-time-input-segments-test',
        components: {
          'date-time-input-date-segment': {
            base: {blockSize: 'var(--size-element-lg)'},
            'size:lg': {paddingInline: 'var(--spacing-4)'},
          },
          'date-time-input-time-segment': {
            base: {blockSize: 'var(--size-element-lg)'},
          },
        },
      });
      const css = generateThemeTestCSS(theme);

      expect(css).toContain('.astryx-date-time-input-date-segment {');
      expect(css).toContain(
        '.astryx-date-time-input-date-segment[data-size="lg"]',
      );
      expect(css).toContain('.astryx-date-time-input-time-segment {');
      expect(css).toContain('block-size: var(--size-element-lg)');
      expect(css).toContain('padding-inline: var(--spacing-4)');
    });

    it('renders the toggle-icon target on the calendar glyph with open/closed state', async () => {
      const {container} = render(
        <DateTimeInput label="Meeting" onChange={() => {}} />,
      );
      // The stable target lands on the icon element itself (not the button),
      // so a theme can restyle just this glyph — mirroring
      // `date-input-toggle-icon`.
      const icon = container.querySelector(
        '.astryx-date-time-input-toggle-icon',
      );
      expect(icon).not.toBeNull();
      expect(icon).toHaveClass('astryx-icon');
      expect(icon).toHaveAttribute('data-state', 'collapsed');

      fireEvent.click(getButton('Open calendar'));
      await waitFor(() => {
        expect(
          container.querySelector('.astryx-date-time-input-toggle-icon'),
        ).toHaveAttribute('data-state', 'expanded');
      });
    });

    it('renders the clock-icon target on the leading time glyph', () => {
      const {container} = render(
        <DateTimeInput label="Meeting" onChange={() => {}} />,
      );
      const icon = container.querySelector(
        '.astryx-date-time-input-clock-icon',
      );
      expect(icon).not.toBeNull();
      expect(icon).toHaveClass('astryx-icon');
    });

    it('leaves both leading glyphs byte-identical to a plain secondary/sm icon by default', () => {
      // The targets are purely additive: the stable target class and reflected
      // state add nothing to the render until a theme or consumer stylesheet
      // targets them. Guard that by diffing each glyph's StyleX classes against
      // a standalone secondary/sm icon, excluding only that theme metadata.
      const {container} = render(
        <DateTimeInput label="Meeting" onChange={() => {}} />,
      );
      const calendarIcon = container.querySelector(
        '.astryx-date-time-input-toggle-icon',
      ) as HTMLElement;
      const clockIcon = container.querySelector(
        '.astryx-date-time-input-clock-icon',
      ) as HTMLElement;

      const {container: refContainer} = render(
        <Icon icon="calendar" size="sm" color="secondary" />,
      );
      const refIcon = refContainer.querySelector('.astryx-icon') as HTMLElement;

      const themeTargetClasses = new Set([
        'astryx-date-time-input-toggle-icon',
        'astryx-date-time-input-clock-icon',
        'collapsed',
        'expanded',
      ]);
      const styleClasses = (el: HTMLElement) =>
        el.className
          .split(' ')
          .filter(c => !themeTargetClasses.has(c))
          .sort();

      expect(styleClasses(calendarIcon)).toEqual(styleClasses(refIcon));
      expect(styleClasses(clockIcon)).toEqual(styleClasses(refIcon));
    });

    it('exposes the icon targets so a theme reaches their size and per-state color', () => {
      // jsdom cannot resolve the @layer cascade, so the generated CSS is what
      // proves a same-element theme rule can reach these glyphs and win over
      // the icon's own base size/color.
      const theme = defineTheme({
        name: 'date-time-input-icon-targets-test',
        components: {
          'date-time-input-toggle-icon': {
            base: {width: '14px', height: '14px', fontSize: '14px'},
            'state:expanded': {color: 'var(--color-icon-primary)'},
          },
          'date-time-input-clock-icon': {
            base: {width: '14px', height: '14px', fontSize: '14px'},
          },
        },
      });
      const css = generateThemeTestCSS(theme);

      expect(css).toContain('.astryx-date-time-input-toggle-icon {');
      expect(css).toContain(
        '.astryx-date-time-input-toggle-icon[data-state="expanded"]',
      );
      expect(css).toContain('.astryx-date-time-input-clock-icon {');
      expect(css).toContain('width: 14px');
      expect(css).toContain('color: var(--color-icon-primary)');
    });
  });
});

describe('DateTimeInput disabled theme state', () => {
  it('reflects disabled on the root target so themes can gate paint on it', () => {
    const {container} = render(
      <DateTimeInput label="Meeting" onChange={() => {}} isDisabled />,
    );
    const root = container.querySelector('.astryx-date-time-input');
    expect(root).toHaveAttribute('data-disabled', 'disabled');
  });

  it('omits data-disabled when enabled, like status does', () => {
    const {container} = render(
      <DateTimeInput label="Meeting" onChange={() => {}} />,
    );
    const root = container.querySelector('.astryx-date-time-input');
    expect(root).not.toHaveAttribute('data-disabled');
  });
});
