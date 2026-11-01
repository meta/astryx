// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DateInput.test.tsx
 * @input Uses vitest, @testing-library/react, DateInput component
 * @output Unit tests for DateInput component behavior
 * @position Testing; validates DateInput.tsx implementation
 *
 * SYNC: When DateInput.tsx changes, update tests to match new behavior
 */

import {useState} from 'react';
import {describe, it, expect, vi, beforeEach} from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
  act,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {getButton, queryButton} from '../__tests__/fastRoleQueries';
import {DateInput, type DateInputProps} from './DateInput';
import {Icon} from '../Icon';
import {InputGroup} from '../InputGroup';
import {InputGroupText} from '../InputGroup/InputGroupText';
import {defineTheme} from '../theme/defineTheme';
import {generateThemeCSS} from '../theme/generateThemeRules';
import {InternationalizationProvider} from '../i18n';
import type {ISODateString} from '../utils';

function generateThemeTestCSS(theme: Parameters<typeof generateThemeCSS>[0]) {
  const {prose, component} = generateThemeCSS(theme);
  return [prose, component].filter(Boolean).join('\n\n');
}
describe('DateInput', () => {
  it('renders with label', () => {
    render(<DateInput label="Date" onChange={() => {}} />);
    expect(screen.getByLabelText('Date')).toBeInTheDocument();
  });

  it('renders with placeholder', () => {
    render(
      <DateInput label="Date" onChange={() => {}} placeholder="Pick a date" />,
    );
    expect(screen.getByPlaceholderText('Pick a date')).toBeInTheDocument();
  });

  it('displays formatted date when value is provided', () => {
    render(<DateInput label="Date" value="2026-01-25" onChange={() => {}} />);
    expect(screen.getByDisplayValue('January 25, 2026')).toBeInTheDocument();
  });

  it('forwards ref correctly', () => {
    const ref = vi.fn();
    render(<DateInput ref={ref} label="Date" onChange={() => {}} />);
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLInputElement));
  });

  it('visually hides label when isLabelHidden is true', () => {
    render(<DateInput label="Date" isLabelHidden onChange={() => {}} />);
    const label = screen.getByText('Date');
    expect(label).toBeInTheDocument();
    expect(screen.getByLabelText('Date')).toBeInTheDocument();
  });

  it('shows label visually by default', () => {
    render(<DateInput label="Event date" onChange={() => {}} />);
    const label = screen.getByText('Event date');
    expect(label).toBeVisible();
  });

  it('sets aria-required when isRequired is true', () => {
    render(<DateInput label="Date" isRequired onChange={() => {}} />);
    expect(screen.getByRole('combobox')).toHaveAttribute(
      'aria-required',
      'true',
    );
  });

  it('does not set aria-required when isRequired is false', () => {
    render(<DateInput label="Date" onChange={() => {}} />);
    expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-required');
  });

  it('keeps a disabled input focusable without native disabled (AST-085 FR1)', () => {
    render(<DateInput label="Date" isDisabled onChange={() => {}} />);
    const input = screen.getByRole('combobox');
    expect(input).not.toHaveAttribute('disabled');
    expect(input).toHaveAttribute('aria-disabled', 'true');
    expect(input).toHaveAttribute('readonly');
    input.focus();
    expect(input).toHaveFocus();
  });

  it('is not disabled by default', () => {
    render(<DateInput label="Date" onChange={() => {}} />);
    expect(screen.getByRole('combobox')).not.toBeDisabled();
  });

  it('renders calendar icon', () => {
    render(<DateInput label="Date" onChange={() => {}} />);
    const svg = document.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('combobox input has aria-haspopup="dialog" attribute', () => {
    render(<DateInput label="Date" onChange={() => {}} />);
    expect(screen.getByRole('combobox')).toHaveAttribute(
      'aria-haspopup',
      'dialog',
    );
  });

  it('calendar button is focusable and clickable', () => {
    render(<DateInput label="Date" onChange={() => {}} />);
    const button = getButton('Open calendar');
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it('calendar button is focusable-disabled when isDisabled is true', () => {
    render(<DateInput label="Date" isDisabled onChange={() => {}} />);
    const button = getButton('Open calendar');
    expect(button).not.toHaveAttribute('disabled');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(button);
    expect(screen.getByRole('combobox')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('does not call onChange while typing invalid input', async () => {
    const onChange = vi.fn();
    render(<DateInput label="Date" onChange={onChange} />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, {target: {value: 'invalid'}});

    expect(onChange).not.toHaveBeenCalled();
  });

  it('sets aria-invalid="true" when typed input is unparseable', () => {
    render(<DateInput label="Date" onChange={() => {}} />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, {target: {value: '13/45/2024'}});

    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('does not set aria-invalid when typed input is a valid date', () => {
    render(<DateInput label="Date" onChange={() => {}} />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, {target: {value: '03/15/2026'}});

    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('announces an alert message when typed input is invalid', () => {
    // Scope to the component's own container: the embedded Calendar uses the
    // shared `useAnnounce` hook, whose global polite/assertive live-region pair
    // (both mounted on document.body by any announce) would otherwise make a
    // document-wide `getByRole('alert')` ambiguous.
    const {container} = render(<DateInput label="Date" onChange={() => {}} />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, {target: {value: '13/45/2024'}});

    expect(within(container).getByRole('alert')).toHaveTextContent(
      'Invalid date',
    );
  });

  it('does not announce an alert message when input is valid', () => {
    const {container} = render(<DateInput label="Date" onChange={() => {}} />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, {target: {value: '03/15/2026'}});

    expect(within(container).getByRole('alert')).toHaveTextContent('');
    expect(screen.queryByText('Invalid date')).not.toBeInTheDocument();
  });

  it('resolves the invalid-date announcement from the i18n catalog', () => {
    const {container} = render(
      <InternationalizationProvider
        locale="en"
        overrides={{en: {'@astryx.dateInput.invalidDate': 'Ungültiges Datum'}}}>
        <DateInput label="Date" onChange={() => {}} />
      </InternationalizationProvider>,
    );

    fireEvent.change(screen.getByRole('combobox'), {
      target: {value: '13/45/2024'},
    });

    expect(within(container).getByRole('alert')).toHaveTextContent(
      'Ungültiges Datum',
    );
  });

  it('reverts to previous value on blur when input is invalid', async () => {
    const onChange = vi.fn();
    render(<DateInput label="Date" value="2026-01-25" onChange={onChange} />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, {target: {value: 'not a date'}});
    fireEvent.blur(input);

    expect(screen.getByDisplayValue('January 25, 2026')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('calls onChange on blur when input is valid', async () => {
    const onChange = vi.fn();
    render(<DateInput label="Date" onChange={onChange} />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, {target: {value: '03/15/2026'}});
    fireEvent.blur(input);

    expect(onChange).toHaveBeenCalledWith('2026-03-15');
  });

  it('calls onChange immediately when input becomes valid', async () => {
    const onChange = vi.fn();
    render(<DateInput label="Date" onChange={onChange} />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, {target: {value: '03/15/2026'}});

    expect(onChange).toHaveBeenCalledWith('2026-03-15');
  });

  it('runs changeAction after onChange for a typed date', async () => {
    const calls: string[] = [];
    let resolveAction: () => void = () => {};
    const changeAction = vi.fn(
      async () =>
        new Promise<void>(resolve => {
          calls.push('changeAction');
          resolveAction = resolve;
        }),
    );
    const onChange = vi.fn(() => calls.push('onChange'));
    render(
      <DateInput
        label="Date"
        onChange={onChange}
        changeAction={changeAction}
      />,
    );

    const input = screen.getByRole('combobox');
    fireEvent.change(input, {target: {value: '03/15/2026'}});

    expect(calls).toEqual(['onChange', 'changeAction']);
    expect(changeAction).toHaveBeenCalledExactlyOnceWith('2026-03-15');
    expect(input).toHaveAttribute('aria-busy', 'true');
    await act(async () => resolveAction());
  });

  // --- P0: Text input respects min/max/dateConstraints ---

  it('does not call onChange when typed date is before min', () => {
    const onChange = vi.fn();
    render(
      <DateInput
        label="Date"
        onChange={onChange}
        min="2026-03-01"
        max="2026-12-31"
      />,
    );

    const input = screen.getByRole('combobox');
    fireEvent.change(input, {target: {value: '02/15/2026'}});

    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not call onChange when typed date is after max', () => {
    const onChange = vi.fn();
    render(
      <DateInput
        label="Date"
        onChange={onChange}
        min="2026-01-01"
        max="2026-03-01"
      />,
    );

    const input = screen.getByRole('combobox');
    fireEvent.change(input, {target: {value: '04/15/2026'}});

    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not call onChange when typed date fails dateConstraints', () => {
    const onChange = vi.fn();
    // Constraint: no weekends
    const noWeekends = (date: Date) =>
      date.getDay() !== 0 && date.getDay() !== 6;
    render(
      <DateInput
        label="Date"
        onChange={onChange}
        dateConstraints={[noWeekends]}
      />,
    );

    const input = screen.getByRole('combobox');
    // 2026-03-15 is a Sunday
    fireEvent.change(input, {target: {value: '03/15/2026'}});

    expect(onChange).not.toHaveBeenCalled();
  });

  it('calls onChange when typed date is within min/max range', () => {
    const onChange = vi.fn();
    render(
      <DateInput
        label="Date"
        onChange={onChange}
        min="2026-01-01"
        max="2026-12-31"
      />,
    );

    const input = screen.getByRole('combobox');
    fireEvent.change(input, {target: {value: '06/15/2026'}});

    expect(onChange).toHaveBeenCalledWith('2026-06-15');
  });

  it('reverts on blur when typed date violates constraints', () => {
    const onChange = vi.fn();
    render(
      <DateInput
        label="Date"
        onChange={onChange}
        value="2026-03-10"
        min="2026-03-01"
        max="2026-03-31"
      />,
    );

    const input = screen.getByRole('combobox');
    fireEvent.change(input, {target: {value: '04/15/2026'}});
    fireEvent.blur(input);

    // Should revert to previous value
    expect(screen.getByDisplayValue('March 10, 2026')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  // --- P1: Input disabled during isBusy (isLoading) ---

  it('blocks input and button without native disabled when isLoading is true', () => {
    render(<DateInput label="Date" isLoading onChange={() => {}} />);
    expect(screen.getByRole('combobox')).not.toHaveAttribute('disabled');
    expect(screen.getByRole('combobox')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(getButton('Open calendar')).not.toHaveAttribute('disabled');
    expect(getButton('Open calendar')).toHaveAttribute('aria-disabled', 'true');
  });

  it('shows spinner when isLoading is true', () => {
    const {container} = render(
      <DateInput label="Date" isLoading onChange={() => {}} />,
    );
    // Spinner renders with role="status" or an SVG animation
    const spinner = container.querySelector('[aria-busy="true"]');
    expect(spinner).toBeInTheDocument();
  });

  // --- P1: Escape key handler ---

  it('handles Escape keydown without error', () => {
    render(<DateInput label="Date" onChange={() => {}} />);
    const input = screen.getByRole('combobox');

    // Escape should not throw even when popover isn't open.
    // Full popover open/close behavior tested in Storybook.
    fireEvent.keyDown(input, {key: 'Escape'});
  });

  // --- P2: Input has role="combobox" ---

  it('input has role="combobox"', () => {
    render(<DateInput label="Date" onChange={() => {}} />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('input has aria-expanded attribute', () => {
    render(<DateInput label="Date" onChange={() => {}} />);
    expect(screen.getByRole('combobox')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('opens the calendar popover on ArrowDown (keyboard, forms-13)', () => {
    render(<DateInput label="Date" onChange={() => {}} />);
    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    fireEvent.keyDown(input, {key: 'ArrowDown'});
    expect(input).toHaveAttribute('aria-expanded', 'true');
  });

  it('opens the calendar popover on Alt+ArrowDown (keyboard, forms-13)', () => {
    render(<DateInput label="Date" onChange={() => {}} />);
    const input = screen.getByRole('combobox');
    fireEvent.keyDown(input, {key: 'ArrowDown', altKey: true});
    expect(input).toHaveAttribute('aria-expanded', 'true');
  });

  it('does not open on ArrowDown when disabled', () => {
    render(<DateInput label="Date" isDisabled onChange={() => {}} />);
    const input = screen.getByRole('combobox');
    fireEvent.keyDown(input, {key: 'ArrowDown'});
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  it('input has aria-haspopup="dialog"', () => {
    render(<DateInput label="Date" onChange={() => {}} />);
    expect(screen.getByRole('combobox')).toHaveAttribute(
      'aria-haspopup',
      'dialog',
    );
  });

  // --- P1: Tab order: calendar button first, then input ---

  it('renders calendar button before input in DOM order', () => {
    const {container} = render(<DateInput label="Date" onChange={() => {}} />);
    const input = container.querySelector('input');
    const button = container.querySelector('button');
    // Calendar button should come before input in the DOM
    expect(button!.compareDocumentPosition(input!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  // --- P2: Status rendering ---

  it('renders status icon for error status', () => {
    render(
      <DateInput
        label="Date"
        onChange={() => {}}
        status={{type: 'error', message: 'Bad date'}}
      />,
    );
    expect(screen.getByRole('combobox')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('renders status icon for warning status', () => {
    render(
      <DateInput
        label="Date"
        onChange={() => {}}
        status={{type: 'warning', message: 'Watch out'}}
      />,
    );
    // Should not be aria-invalid for warnings
    expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-invalid');
  });

  it('renders status icon for success status', () => {
    render(
      <DateInput
        label="Date"
        onChange={() => {}}
        status={{type: 'success', message: 'Looks good'}}
      />,
    );
    expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-invalid');
  });

  // --- P1: Description and aria-describedby ---

  it('renders description and links via aria-describedby', () => {
    render(
      <DateInput
        label="Date"
        description="Pick your preferred date"
        onChange={() => {}}
      />,
    );
    const input = screen.getByRole('combobox');
    expect(screen.getByText('Pick your preferred date')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-describedby');
    const describedBy = input.getAttribute('aria-describedby')!;
    const descEl = document.getElementById(describedBy);
    expect(descEl).toHaveTextContent('Pick your preferred date');
  });

  it('links status message via aria-describedby', () => {
    render(
      <DateInput
        label="Date"
        onChange={() => {}}
        status={{type: 'error', message: 'Invalid date'}}
      />,
    );
    const input = screen.getByRole('combobox');
    const describedBy = input.getAttribute('aria-describedby')!;
    const ids = describedBy.split(' ');
    const found = ids.some(id => {
      const el = document.getElementById(id);
      return el?.textContent?.includes('Invalid date');
    });
    expect(found).toBe(true);
  });

  // --- P1: Clearing value on empty blur ---

  it('calls onChange with undefined when input is cleared and blurred', () => {
    const onChange = vi.fn();
    render(<DateInput label="Date" value="2026-01-25" onChange={onChange} />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, {target: {value: ''}});
    fireEvent.blur(input);

    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  // --- P1: Disabled prevents onChange ---

  it('disables input when isDisabled is true', () => {
    render(<DateInput label="Date" isDisabled onChange={() => {}} />);

    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('aria-disabled', 'true');
    expect(input).not.toHaveAttribute('disabled');
  });

  // --- P1: aria-busy on input ---

  it('sets aria-busy on input when isLoading is true', () => {
    render(<DateInput label="Date" isLoading onChange={() => {}} />);
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-busy', 'true');
  });

  it('does not set aria-busy when not loading', () => {
    render(<DateInput label="Date" onChange={() => {}} />);
    expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-busy');
  });

  // --- P1: Popover does not open when disabled ---

  it('does not open popover when clicking calendar button while disabled', () => {
    render(<DateInput label="Date" isDisabled onChange={() => {}} />);
    const button = getButton('Open calendar');
    fireEvent.click(button);
    expect(screen.getByRole('combobox')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('blocks selection in an open picker after the field becomes disabled', async () => {
    const user = userEvent.setup();
    const props = {
      label: 'Date',
      value: '2026-10-15',
      presentation: 'popover',
      onChange: vi.fn(),
      changeAction: vi.fn(),
    } satisfies DateInputProps;
    const {rerender} = render(<DateInput {...props} />);
    const input = screen.getByRole('combobox');
    act(() => input.focus());
    await user.keyboard('{ArrowDown}');
    const day = getButton(/October 16, 2026/);
    act(() => day.focus());

    rerender(<DateInput {...props} isDisabled />);
    expect(day).toHaveFocus();
    await user.click(day);
    await user.keyboard(' ');

    rerender(
      <DateInput
        {...props}
        isDisabled
        disabledMessage="Scheduling is locked"
      />,
    );
    expect(day).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(props.onChange).not.toHaveBeenCalled();
    expect(props.changeAction).not.toHaveBeenCalled();
    expect(input).toHaveValue('October 15, 2026');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(day).toHaveFocus();
  });

  it('dismisses an open picker without committing while loading', async () => {
    const user = userEvent.setup();
    const props = {
      label: 'Date',
      value: '2026-10-15',
      presentation: 'popover',
      onChange: vi.fn(),
      changeAction: vi.fn(),
    } satisfies DateInputProps;
    const {rerender} = render(<DateInput {...props} />);
    await user.click(getButton('Open calendar'));
    const day = getButton(/October 16, 2026/);

    rerender(<DateInput {...props} isLoading />);
    await user.click(day);
    expect(props.onChange).not.toHaveBeenCalled();
    expect(props.changeAction).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox')).toHaveValue('October 15, 2026');
    expect(screen.getByRole('combobox')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  // --- Enter key commits typed date ---

  it('commits typed date and fires onChange on Enter key', () => {
    const onChange = vi.fn();
    render(<DateInput label="Date" onChange={onChange} />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, {target: {value: '03/15/2026'}});
    onChange.mockClear();
    fireEvent.keyDown(input, {key: 'Enter'});

    expect(onChange).toHaveBeenCalledWith('2026-03-15');
  });

  it('does not commit on a composing Enter (IME)', () => {
    const onChange = vi.fn();
    render(<DateInput label="Date" onChange={onChange} />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, {target: {value: '03/15/2026'}});
    onChange.mockClear();

    // The composing keydown (isComposing / legacy keyCode 229) that commits an
    // IME candidate fires before compositionend; it must not be read as
    // "commit the typed date".
    fireEvent.keyDown(input, {key: 'Enter', isComposing: true});
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(input, {key: 'Enter', keyCode: 229});
    expect(onChange).not.toHaveBeenCalled();

    // A real, non-composing Enter still commits.
    fireEvent.keyDown(input, {key: 'Enter'});
    expect(onChange).toHaveBeenCalledWith('2026-03-15');
  });

  // --- Arrow-down opens calendar popover ---

  // Note: Tests involving popover rendering (show/hide with calendar)
  // are limited because jsdom doesn't support the Popover API.
  // Full popover interaction is tested in the browser via Storybook.

  describe('hasClear', () => {
    it('shows no selected calendar days after clearing', async () => {
      const user = userEvent.setup();

      function ControlledDateInput() {
        const [value, setValue] = useState<ISODateString | undefined>(
          '2026-01-01',
        );
        return (
          <DateInput
            label="Date"
            value={value}
            onChange={setValue}
            min="2026-01-01"
            max="2026-01-31"
            presentation="popover"
            hasClear
          />
        );
      }

      render(<ControlledDateInput />);
      const toggle = getButton('Open calendar');
      await user.click(toggle);
      await user.click(getButton(/January 15, 2026/));
      // The calendar mounts only while open; reopen it to read the selection.
      await user.click(toggle);
      expect(
        screen.getAllByRole('gridcell', {selected: true, hidden: true}),
      ).toHaveLength(1);
      await user.click(toggle);

      await user.click(getButton('Clear Date'));
      expect(screen.getByRole('combobox')).toHaveValue('');
      await user.click(toggle);

      expect(
        screen.queryAllByRole('gridcell', {selected: true, hidden: true}),
      ).toHaveLength(0);
    });

    it('shows clear button when hasClear is true and value exists', () => {
      render(
        <DateInput
          label="Date"
          value="2026-01-15"
          onChange={() => {}}
          hasClear
        />,
      );
      expect(getButton('Clear Date')).toBeInTheDocument();
    });

    it('does not show clear button when value is undefined', () => {
      render(<DateInput label="Date" onChange={() => {}} hasClear />);
      expect(queryButton('Clear Date')).not.toBeInTheDocument();
    });

    it('does not show clear button when hasClear is false', () => {
      render(<DateInput label="Date" value="2026-01-15" onChange={() => {}} />);
      expect(queryButton('Clear Date')).not.toBeInTheDocument();
    });

    it('does not show clear button when disabled', () => {
      render(
        <DateInput
          label="Date"
          value="2026-01-15"
          onChange={() => {}}
          hasClear
          isDisabled
        />,
      );
      expect(queryButton('Clear Date')).not.toBeInTheDocument();
    });

    it('calls onChange with undefined when clear is clicked', () => {
      const onChange = vi.fn();
      render(
        <DateInput
          label="Date"
          value="2026-01-15"
          onChange={onChange}
          hasClear
        />,
      );
      fireEvent.click(getButton('Clear Date'));
      expect(onChange).toHaveBeenCalledWith(undefined);
    });
  });

  // --- Regression: in-progress / leading-zero input must not crash ---

  describe('incomplete typed input', () => {
    it('does not crash or fire onChange when first digit typed is 0', () => {
      const onChange = vi.fn();
      render(<DateInput label="Date" onChange={onChange} />);

      const input = screen.getByRole('combobox');
      // Typing a leading "0" (e.g. starting "01" for January) must be treated
      // as incomplete input, not coerced into an (invalid) date that crashes.
      expect(() =>
        fireEvent.change(input, {target: {value: '0'}}),
      ).not.toThrow();

      expect(onChange).not.toHaveBeenCalled();
      expect(input).toHaveValue('0');
    });

    it('does not crash or fire onChange when first digit typed is 1', () => {
      const onChange = vi.fn();
      render(<DateInput label="Date" onChange={onChange} />);

      const input = screen.getByRole('combobox');
      expect(() =>
        fireEvent.change(input, {target: {value: '1'}}),
      ).not.toThrow();

      expect(onChange).not.toHaveBeenCalled();
      expect(input).toHaveValue('1');
    });

    it('does not crash while progressively typing a numeric date', () => {
      const onChange = vi.fn();
      render(<DateInput label="Date" onChange={onChange} />);

      const input = screen.getByRole('combobox');
      // Simulate keystroke-by-keystroke entry of "01/15/2026". The leading
      // single-digit keystrokes must not crash (the original bug).
      for (const partial of ['0', '01', '01/', '01/1', '01/15', '01/15/']) {
        expect(() =>
          fireEvent.change(input, {target: {value: partial}}),
        ).not.toThrow();
      }

      // Completing the date commits it without error.
      expect(() =>
        fireEvent.change(input, {target: {value: '01/15/2026'}}),
      ).not.toThrow();
      expect(onChange).toHaveBeenCalledWith('2026-01-15');
    });

    it('does not crash on blur after typing an incomplete value', () => {
      const onChange = vi.fn();
      render(<DateInput label="Date" onChange={onChange} />);

      const input = screen.getByRole('combobox');
      fireEvent.change(input, {target: {value: '0'}});
      expect(() => fireEvent.blur(input)).not.toThrow();
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('external value changes', () => {
    it('clears pending input when value changes externally', () => {
      const onChange = vi.fn();
      const {rerender} = render(
        <DateInput label="Date" value="2026-01-15" onChange={onChange} />,
      );

      const input = screen.getByRole('combobox');
      expect(input).toHaveValue('January 15, 2026');

      // User starts typing — sets pending input
      fireEvent.change(input, {target: {value: 'Feb'}});
      expect(input).toHaveValue('Feb');

      // Value changes externally (e.g. parent resets the date)
      rerender(
        <DateInput label="Date" value="2026-03-20" onChange={onChange} />,
      );

      // Pending input should be cleared, showing the new formatted value
      expect(input).toHaveValue('March 20, 2026');
    });
  });

  describe('InputGroup', () => {
    it('uses group ARIA and skips standalone Field chrome when grouped', () => {
      render(
        <InputGroup
          label="Availability"
          description="Choose a start date"
          status={{type: 'error', message: 'Date is required'}}>
          <InputGroupText>Starts</InputGroupText>
          <DateInput label="Date" isLabelHidden onChange={() => {}} />
        </InputGroup>,
      );

      const group = screen.getByRole('group', {name: 'Availability'});
      const input = screen.getByRole('combobox', {
        name: 'Availability Date',
      });

      expect(document.querySelectorAll('.astryx-field')).toHaveLength(1);
      expect(input).toHaveAttribute('aria-labelledby');
      expect(input.getAttribute('aria-labelledby')).toContain(
        group.getAttribute('aria-labelledby'),
      );
      expect(input).toHaveAttribute(
        'aria-describedby',
        group.getAttribute('aria-describedby'),
      );
      expect(input).not.toHaveAttribute('aria-invalid');
      expect(screen.getByText('Date is required')).toBeInTheDocument();
    });

    it('preserves disabledMessage tooltip wiring when grouped', () => {
      render(
        <InputGroup label="Availability">
          <InputGroupText>Starts</InputGroupText>
          <DateInput
            label="Date"
            isLabelHidden
            isDisabled
            disabledMessage="Scheduling is locked"
            onChange={() => {}}
          />
        </InputGroup>,
      );

      const input = screen.getByRole('combobox', {name: 'Availability Date'});
      const tooltip = screen.getByRole('tooltip', {hidden: true});

      expect(input).not.toBeDisabled();
      expect(input).toHaveAttribute('aria-disabled', 'true');
      expect(input.getAttribute('aria-describedby')).toContain(tooltip.id);
      expect(tooltip).toHaveTextContent('Scheduling is locked');
      expect(getButton('Open calendar')).toHaveAttribute(
        'aria-disabled',
        'true',
      );
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
        <DateInput
          label="Date"
          isDisabled
          disabledMessage="You need the Editor role"
        />,
      );

      const container = screen.getByRole('combobox')
        .parentElement as HTMLElement;
      const tooltip = screen.getByRole('tooltip', h);
      expect(tooltip).toHaveTextContent('You need the Editor role');

      fireEvent.mouseEnter(container);
      await waitFor(() => {
        expect(tooltip).toHaveAttribute('popover-open');
      });

      fireEvent.mouseLeave(container);
      await waitFor(() => {
        expect(tooltip).not.toHaveAttribute('popover-open');
      });
    });

    it('shows the reason tooltip on keyboard focus', async () => {
      const user = userEvent.setup();
      render(
        <DateInput
          label="Date"
          isDisabled
          disabledMessage="You need the Editor role"
        />,
      );

      const tooltip = screen.getByRole('tooltip', h);
      // The calendar button keeps its enabled tab stop (spec:AST-085 FR1),
      // so the input is the second stop.
      await user.tab();
      expect(getButton('Open calendar')).toHaveFocus();
      await user.tab();
      expect(screen.getByRole('combobox')).toHaveFocus();
      await waitFor(() => {
        expect(tooltip).toHaveAttribute('popover-open');
      });
    });

    it('does not render a tooltip when not disabled', () => {
      render(
        <DateInput label="Date" disabledMessage="You need the Editor role" />,
      );
      expect(screen.queryByRole('tooltip', h)).not.toBeInTheDocument();
    });

    it('does not render a tooltip when disabled without a reason', () => {
      render(<DateInput label="Date" isDisabled />);
      expect(screen.queryByRole('tooltip', h)).not.toBeInTheDocument();
    });

    it('keeps the input focusable via aria-disabled when a reason is provided', () => {
      render(
        <DateInput
          label="Date"
          isDisabled
          disabledMessage="You need the Editor role"
        />,
      );
      const input = screen.getByRole('combobox');
      expect(input).not.toBeDisabled();
      expect(input).toHaveAttribute('aria-disabled', 'true');
      expect(input).toHaveAttribute('readonly');
    });

    it('does not call a caller onClick while disabled (AST-085 FR2)', () => {
      const onClick = vi.fn();
      render(<DateInput label="Date" isDisabled onClick={onClick} />);
      fireEvent.click(screen.getByRole('combobox'));
      expect(onClick).not.toHaveBeenCalled();
    });

    it('links the reason tooltip from the calendar button too (AST-085 FR5)', () => {
      render(
        <DateInput
          label="Date"
          isDisabled
          disabledMessage="You need the Editor role"
        />,
      );
      const tooltip = screen.getByRole('tooltip', h);
      expect(
        getButton('Open calendar').getAttribute('aria-describedby'),
      ).toContain(tooltip.id);
    });

    it('drops a draft instead of committing it when the field becomes disabled (AST-085 FR2)', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      const {rerender} = render(
        <DateInput label="Date" value="2026-03-10" onChange={onChange} />,
      );
      const input = screen.getByRole('combobox');
      await user.click(input);
      await user.clear(input);
      rerender(
        <DateInput
          label="Date"
          value="2026-03-10"
          onChange={onChange}
          isDisabled
        />,
      );
      expect(input).toHaveFocus();
      await user.keyboard('{Enter}');
      await user.tab();
      expect(onChange).not.toHaveBeenCalled();
    });

    it('links the reason tooltip from the input via aria-describedby', () => {
      render(
        <DateInput
          label="Date"
          isDisabled
          disabledMessage="You need the Editor role"
        />,
      );
      const input = screen.getByRole('combobox');
      const tooltip = screen.getByRole('tooltip', h);
      expect(input.getAttribute('aria-describedby')).toContain(tooltip.id);
    });

    it('blocks value changes and opening while focusable-disabled', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <DateInput
          label="Date"
          onChange={onChange}
          isDisabled
          disabledMessage="You need the Editor role"
        />,
      );

      const input = screen.getByRole('combobox');
      await user.click(input);
      await user.type(input, '2026-03-15');
      expect(input).toHaveValue('');
      expect(input).toHaveAttribute('aria-expanded', 'false');
      expect(onChange).not.toHaveBeenCalled();
    });

    it('blocks value changes and opening when disabled without a reason (AST-085 FR1, FR2)', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<DateInput label="Date" onChange={onChange} isDisabled />);
      const input = screen.getByRole('combobox');
      expect(input).not.toHaveAttribute('disabled');
      await user.click(input);
      await user.type(input, '2026-03-15');
      await user.keyboard('{ArrowDown}');
      expect(input).toHaveValue('');
      expect(input).toHaveAttribute('aria-expanded', 'false');
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('format', () => {
    it('defaults to the long-month date_long shape', () => {
      // Non-breaking default: byte-identical to the historical hardcoded
      // DATE_FORMAT_LONG rendering. `format` now defaults to 'date_long'.
      render(<DateInput label="Date" value="2026-01-25" onChange={() => {}} />);
      expect(screen.getByDisplayValue('January 25, 2026')).toBeInTheDocument();
    });

    it('renders the long-month shape for explicit format="date_long"', () => {
      // Explicit date_long is identical to the unset default above and to the
      // old hardcoded long-month output — real named parity with Timestamp.
      render(
        <DateInput
          label="Date"
          value="2026-01-25"
          onChange={() => {}}
          format="date_long"
        />,
      );
      expect(screen.getByDisplayValue('January 25, 2026')).toBeInTheDocument();
    });

    it('renders the short-month shape for format="date"', () => {
      // Same literal + same shape as <Timestamp format="date" />.
      render(
        <DateInput
          label="Date"
          value="2026-01-25"
          onChange={() => {}}
          format="date"
        />,
      );
      expect(screen.getByDisplayValue('Jan 25, 2026')).toBeInTheDocument();
    });

    it('updates when the InternationalizationProvider locale changes (#5074)', () => {
      const renderDateInput = (locale: 'en-US' | 'es-ES') => (
        <InternationalizationProvider locale={locale}>
          <DateInput
            label="Date"
            value="2026-01-25"
            onChange={() => {}}
            format="date_long"
          />
        </InternationalizationProvider>
      );
      const {rerender} = render(renderDateInput('en-US'));

      expect(screen.getByDisplayValue('January 25, 2026')).toBeInTheDocument();

      rerender(renderDateInput('es-ES'));
      expect(
        screen.getByDisplayValue('25 de enero de 2026'),
      ).toBeInTheDocument();
    });

    it('renders the ISO shape for format="system_date"', () => {
      render(
        <DateInput
          label="Date"
          value="2026-01-25"
          onChange={() => {}}
          format="system_date"
        />,
      );
      expect(screen.getByDisplayValue('2026-01-25')).toBeInTheDocument();
    });

    it('renders a weekday prefix for format="date_weekday"', () => {
      render(
        <DateInput
          label="Date"
          value="2026-01-25"
          onChange={() => {}}
          format="date_weekday"
        />,
      );
      // 2026-01-25 is a Sunday; assert the weekday-prefixed shape without
      // over-fitting locale punctuation.
      const input = screen.getByRole('combobox');
      expect(input).toHaveValue('Sun, Jan 25, 2026');
    });

    it('supports a custom function format', () => {
      render(
        <DateInput
          label="Date"
          value="2026-01-25"
          onChange={() => {}}
          format={iso => `custom:${iso}`}
        />,
      );
      expect(screen.getByDisplayValue('custom:2026-01-25')).toBeInTheDocument();
    });

    it('does not apply format to in-progress typed input', async () => {
      const user = userEvent.setup();
      render(
        <DateInput label="Date" onChange={() => {}} format="system_date" />,
      );
      const input = screen.getByRole('combobox');
      await user.click(input);
      await user.type(input, 'January 25');
      // While typing, the raw text is shown verbatim — not reformatted.
      expect(input).toHaveValue('January 25');
    });

    it('recomputes the display in format on external value change', () => {
      const {rerender} = render(
        <DateInput
          label="Date"
          value="2026-01-25"
          onChange={() => {}}
          format="date"
        />,
      );
      expect(screen.getByDisplayValue('Jan 25, 2026')).toBeInTheDocument();
      rerender(
        <DateInput
          label="Date"
          value="2026-03-10"
          onChange={() => {}}
          format="date"
        />,
      );
      expect(screen.getByDisplayValue('Mar 10, 2026')).toBeInTheDocument();
    });
  });
  describe('calendar while the popover is closed', () => {
    const calendarGrid = () => document.querySelector('[role="grid"]');

    it('renders no calendar until the popover opens, and none after it closes', () => {
      render(<DateInput label="Date" value="2026-01-25" onChange={() => {}} />);
      const toggle = getButton('Open calendar');
      expect(calendarGrid()).toBeNull();

      fireEvent.click(toggle);
      expect(calendarGrid()).not.toBeNull();

      fireEvent.click(toggle);
      expect(calendarGrid()).toBeNull();
    });

    it('opens on the month of a date typed while closed', () => {
      function Controlled() {
        const [value, setValue] = useState<ISODateString | undefined>(
          '2026-01-25',
        );
        return <DateInput label="Date" value={value} onChange={setValue} />;
      }
      render(<Controlled />);
      const input = screen.getByRole('combobox');

      fireEvent.change(input, {target: {value: 'March 5, 2027'}});
      fireEvent.keyDown(input, {key: 'ArrowDown'});

      expect(calendarGrid()).toHaveAccessibleName('March 2027');
    });

    it('moves focus into the calendar on each open from the toggle', async () => {
      render(<DateInput label="Date" value="2026-01-25" onChange={() => {}} />);
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
      fireEvent.keyDown(screen.getByRole('combobox'), {key: 'ArrowDown'});
      return Array.from(container.querySelectorAll('[role="columnheader"]'))
        .slice(0, 7)
        .map(h => h.textContent);
    };

    it('defaults to a Sunday-first week', () => {
      const {container} = render(
        <DateInput label="Date" onChange={() => {}} />,
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
        <DateInput label="Date" onChange={() => {}} weekStartsOn={1} />,
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
        <DateInput label="Date" onChange={() => {}} weekStartsOn="mon" />,
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
});

describe('DateInput statusVariant forwarding', () => {
  it('defaults to attached (status renders with data-variant="attached")', () => {
    const {container} = render(
      <DateInput
        label="Date"
        onChange={() => {}}
        status={{type: 'error', message: 'Bad date'}}
      />,
    );
    expect(container.querySelector('.astryx-field-status')).toHaveAttribute(
      'data-variant',
      'attached',
    );
  });

  it('forwards statusVariant="detached" to the underlying Field status', () => {
    const {container} = render(
      <DateInput
        label="Date"
        onChange={() => {}}
        status={{type: 'error', message: 'Bad date'}}
        statusVariant="detached"
      />,
    );
    expect(container.querySelector('.astryx-field-status')).toHaveAttribute(
      'data-variant',
      'detached',
    );
  });
});

describe('DateInput clear icon theme target', () => {
  // Resolve the clear glyph span (the astryx-icon element inside the clear
  // button), independent of the theme target class.
  const getClearIcon = (): HTMLElement => {
    const button = getButton('Clear Date');
    const icon = button.querySelector('.astryx-icon');
    if (icon == null) {
      throw new Error('clear icon not found');
    }
    return icon as HTMLElement;
  };

  it('renders only the astryx-input-clear-icon target on the clear glyph', () => {
    render(
      <DateInput
        label="Date"
        value="2026-01-15"
        onChange={() => {}}
        hasClear
      />,
    );
    // The canonical target lands on the icon element itself (not the button),
    // so a theme can restyle just this glyph (color, size, hover) via
    // `defineTheme` — a button-level target could not reach the icon's own
    // color/size.
    const icon = getClearIcon();
    expect(icon).toHaveClass('astryx-input-clear-icon');
    expect(icon).not.toHaveClass('astryx-date-input-clear-icon');
    expect(icon).toHaveClass('astryx-icon');
  });

  it('keeps the clear button functional alongside the target', () => {
    const onChange = vi.fn();
    render(
      <DateInput
        label="Date"
        value="2026-01-15"
        onChange={onChange}
        hasClear
      />,
    );
    const clear = getButton('Clear Date');
    expect(clear.tagName).toBe('BUTTON');
    fireEvent.click(clear);
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('routes the clear glyph through the shared clear button', () => {
    // The clear affordance composes the shared InputClearButton (a ghost Button
    // with a secondary/sm glyph), so the icon carries the canonical
    // `astryx-input-clear-icon` target. Aside from that target class it matches
    // the shared button's own `close`/`sm`/`secondary` glyph exactly, so the
    // default look is defined in one place.
    render(
      <DateInput
        label="Date"
        value="2026-01-15"
        onChange={() => {}}
        hasClear
      />,
    );
    const icon = getClearIcon();
    expect(icon).toHaveClass('astryx-input-clear-icon');
    expect(icon).not.toHaveClass('astryx-date-input-clear-icon');

    const {container: refContainer} = render(
      <Icon icon="close" size="sm" color="secondary" />,
    );
    const refIcon = refContainer.querySelector('.astryx-icon') as HTMLElement;

    const styleClasses = (el: HTMLElement) =>
      el.className
        .split(' ')
        .filter(c => c !== 'astryx-input-clear-icon')
        .sort();

    expect(styleClasses(icon)).toEqual(styleClasses(refIcon));
  });

  it('uses input-clear-icon so a theme reaches the icon color, size, and hover', () => {
    // jsdom cannot resolve the @layer cascade, so the DOM-class assertion above
    // (target lands on the icon element) plus this generation assertion (the
    // theme emits same-element icon rules in @layer astryx-theme) together
    // prove the seam: a same-element theme rule wins over the icon's own
    // base-layer color/size.
    const theme = defineTheme({
      name: 'date-input-shared-clear-icon-test',
      components: {
        'input-clear-icon': {
          base: {
            width: '12px',
            height: '12px',
            fontSize: '12px',
            color: 'var(--color-icon-secondary)',
            ':hover': {color: 'var(--color-icon-primary)'},
          },
        },
      },
    });
    const css = generateThemeTestCSS(theme);
    expect(css).toContain('.astryx-input-clear-icon {');
    expect(css).toContain('width: 12px');
    expect(css).toContain('height: 12px');
    expect(css).toContain('.astryx-input-clear-icon:hover');
    expect(css).toContain('color: var(--color-icon-primary)');
  });
});

describe('DateInput calendar-toggle icon theme target', () => {
  const iconIn = (button: HTMLElement): HTMLElement => {
    const icon = button.querySelector('.astryx-icon');
    if (icon == null) {
      throw new Error('toggle icon not found');
    }
    return icon as HTMLElement;
  };

  it('renders the astryx-date-input-toggle-icon target on the toggle glyph', () => {
    render(<DateInput label="Date" onChange={() => {}} />);
    const icon = iconIn(getButton('Open calendar'));
    // The stable theme target lands on the icon element itself (not the
    // button), so a theme can restyle just this glyph (color, size, hover) —
    // and each open/closed state — via `defineTheme`. A button-level target
    // could not reach the icon's own color/size.
    expect(icon).toHaveClass('astryx-date-input-toggle-icon');
    expect(icon).toHaveClass('astryx-icon');
    // Open/closed state is reflected so a theme can target each state alone.
    expect(icon).toHaveAttribute('data-state', 'collapsed');
  });

  it('reflects the expanded state on the toggle icon when the popover is open', async () => {
    render(<DateInput label="Date" onChange={() => {}} />);
    // Capture the toggle before opening — its aria-label changes to the close
    // label once open, but the element reference (and its icon) is stable.
    const toggle = getButton('Open calendar');
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(iconIn(toggle)).toHaveAttribute('data-state', 'expanded');
    });
  });

  it('keeps the calendar-toggle button functional alongside the target', () => {
    render(<DateInput label="Date" onChange={() => {}} />);
    const toggle = getButton('Open calendar');
    expect(toggle.tagName).toBe('BUTTON');
  });

  it('renders the default icon (secondary color, sm size) byte-identically', () => {
    // Pixel-identical default guard: the toggle glyph must carry the exact same
    // StyleX color/size classes as a standalone secondary/sm icon. The added
    // target class + data-state are purely additive — they change nothing until
    // a theme targets them.
    render(<DateInput label="Date" onChange={() => {}} />);
    const icon = iconIn(getButton('Open calendar'));

    const {container: refContainer} = render(
      <Icon icon="calendar" size="sm" color="secondary" />,
    );
    const refIcon = refContainer.querySelector('.astryx-icon') as HTMLElement;

    // Exclude the additive theme-target classes (the stable target + its
    // reflected state class) so only the StyleX color/size classes remain.
    const themeTargetClasses = new Set([
      'astryx-date-input-toggle-icon',
      'collapsed',
      'expanded',
    ]);
    const styleClasses = (el: HTMLElement) =>
      el.className
        .split(' ')
        .filter(c => !themeTargetClasses.has(c))
        .sort();

    expect(styleClasses(icon)).toEqual(styleClasses(refIcon));
  });

  it('exposes date-input-toggle-icon so a theme reaches the icon size and per-state color', () => {
    // jsdom cannot resolve the @layer cascade, so the DOM-class assertions
    // above (target lands on the icon element) plus this generation assertion
    // (the theme emits same-element icon rules in @layer astryx-theme) together
    // prove the seam: a same-element theme rule wins over the icon's own
    // base-layer color/size.
    const theme = defineTheme({
      name: 'date-input-toggle-icon-test',
      components: {
        'date-input-toggle-icon': {
          base: {width: '14px', height: '14px', fontSize: '14px'},
          'state:expanded': {color: 'var(--color-icon-primary)'},
        },
      },
    });
    const css = generateThemeTestCSS(theme);
    expect(css).toContain('.astryx-date-input-toggle-icon {');
    expect(css).toContain('width: 14px');
    expect(css).toContain('height: 14px');
    expect(css).toContain(
      '.astryx-date-input-toggle-icon[data-state="expanded"]',
    );
    expect(css).toContain('color: var(--color-icon-primary)');
  });
});

describe('DateInput disabled theme state', () => {
  it('reflects disabled on the root target so themes can gate paint on it', () => {
    const {container} = render(
      <DateInput label="Date" onChange={() => {}} isDisabled />,
    );
    const root = container.querySelector('.astryx-date-input');
    expect(root).toHaveAttribute('data-disabled', 'disabled');
  });

  it('omits data-disabled when enabled, like status does', () => {
    const {container} = render(<DateInput label="Date" onChange={() => {}} />);
    const root = container.querySelector('.astryx-date-input');
    expect(root).not.toHaveAttribute('data-disabled');
  });
});
