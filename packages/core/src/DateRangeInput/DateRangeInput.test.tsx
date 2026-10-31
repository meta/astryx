// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DateRangeInput.test.tsx
 * @input Uses vitest, @testing-library/react, DateRangeInput component
 * @output Unit tests for DateRangeInput component behavior
 * @position Testing; validates DateRangeInput.tsx implementation
 *
 * SYNC: When DateRangeInput.tsx changes, update tests to match new behavior
 */

import {useState} from 'react';
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {render, screen, fireEvent, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';

function generateThemeTestCSS(theme: Parameters<typeof generateThemeCSS>[0]) {
  const {prose, component} = generateThemeCSS(theme);
  return [prose, component].filter(Boolean).join('\n\n');
}
// getButton/queryButton instead of getByRole('button', {name}): the open
// popover holds a two-month Calendar (~85 role=button nodes), which makes
// every role+name query compute ~85 accessible names through jsdom's
// slow getComputedStyle (~450ms per query). See fastRoleQueries.ts.
import {getButton, queryButton} from '../__tests__/fastRoleQueries';
import * as stylex from '@stylexjs/stylex';
import {colorVars} from '../theme/tokens.stylex';
import {DateRangeInput} from './DateRangeInput';
import type {DateRange} from './DateRangeInput';
import {Icon} from '../Icon';
import {defineTheme} from '../theme/defineTheme';
import {generateThemeCSS} from '../theme/generateThemeRules';
import {InternationalizationProvider} from '../i18n';

describe('DateRangeInput', () => {
  it('renders with label', () => {
    render(
      <DateRangeInput label="Date range" value={null} onChange={() => {}} />,
    );
    expect(screen.getByText('Date range')).toBeInTheDocument();
  });

  it('renders placeholder when value is null', () => {
    render(<DateRangeInput label="Range" value={null} onChange={() => {}} />);
    expect(screen.getByText('Select date range')).toBeInTheDocument();
  });

  it('renders custom placeholder', () => {
    render(
      <DateRangeInput
        label="Range"
        value={null}
        onChange={() => {}}
        placeholder="Pick dates"
      />,
    );
    expect(screen.getByText('Pick dates')).toBeInTheDocument();
  });

  it('displays formatted range when value is set', () => {
    const range: DateRange = {
      start: '2026-03-15',
      end: '2026-03-22',
    };
    render(
      <DateRangeInput
        label="Range"
        value={range}
        onChange={() => {}}
        hasClear={false}
      />,
    );
    const trigger = getButton(/Range:/);
    expect(trigger.textContent).toMatch(/Mar/);
    expect(trigger.textContent).toMatch(/15/);
    expect(trigger.textContent).toMatch(/22/);
  });

  it('updates the committed range display when provider locale changes', () => {
    const range: DateRange = {
      start: '2025-01-02',
      end: '2025-01-05',
    };
    const renderDateRangeInput = (locale: 'en-US' | 'es-ES') => (
      <InternationalizationProvider locale={locale}>
        <DateRangeInput
          label="Range"
          value={range}
          onChange={() => {}}
          hasClear={false}
        />
      </InternationalizationProvider>
    );
    const {rerender} = render(renderDateRangeInput('en-US'));

    expect(screen.getByText('Jan 2, 2025 – Jan 5, 2025')).toBeInTheDocument();

    rerender(renderDateRangeInput('es-ES'));
    expect(screen.getByText('2 ene 2025 – 5 ene 2025')).toBeInTheDocument();
  });

  it('forwards ref to trigger button', () => {
    const ref = vi.fn();
    render(
      <DateRangeInput
        ref={ref}
        label="Range"
        value={null}
        onChange={() => {}}
      />,
    );
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLButtonElement));
  });

  it('visually hides label when isLabelHidden is true', () => {
    render(
      <DateRangeInput
        label="Range"
        isLabelHidden
        value={null}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('Range')).toBeInTheDocument();
  });

  it('announces required state from a valid button description', () => {
    render(
      <DateRangeInput
        label="Range"
        isRequired
        value={null}
        onChange={() => {}}
      />,
    );
    const trigger = getButton(/Range/);
    expect(trigger).not.toHaveAttribute('aria-required');
    const describedBy = trigger.getAttribute('aria-describedby');
    expect(describedBy).not.toBeNull();
    expect(document.getElementById(describedBy!)).toHaveTextContent('Required');
  });

  it('does not add a required description when isRequired is false', () => {
    render(<DateRangeInput label="Range" value={null} onChange={() => {}} />);
    const trigger = getButton(/Range/);
    expect(trigger).not.toHaveAttribute('aria-required');
    expect(trigger).not.toHaveAttribute('aria-describedby');
  });

  it('disables trigger when isDisabled is true', () => {
    render(
      <DateRangeInput
        label="Range"
        isDisabled
        value={null}
        onChange={() => {}}
      />,
    );
    const trigger = getButton(/Range/);
    expect(trigger).not.toHaveAttribute('disabled');
    expect(trigger).toHaveAttribute('aria-disabled', 'true');
    trigger.focus();
    expect(trigger).toHaveFocus();
  });

  it('restores the focus ring on a focused disabled field (AST-085 FR6)', () => {
    // The same declarations as the field's ring style compile to the same
    // atomic classes.
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
      // Keep the atomic classes, not the dev-only debug name.
      .filter(name => !name.includes('__'));
    render(
      <DateRangeInput
        label="Range"
        isDisabled
        value={null}
        onChange={() => {}}
      />,
    );
    // The shared disabled style alone drops these :focus-within declarations.
    const wrapper = getButton(/Range/).parentElement!;
    for (const name of ringClasses) {
      expect(wrapper).toHaveClass(name);
    }
  });

  it('is not disabled by default', () => {
    render(<DateRangeInput label="Range" value={null} onChange={() => {}} />);
    const trigger = getButton(/Range/);
    expect(trigger).not.toBeDisabled();
  });

  it('trigger has aria-haspopup="dialog"', () => {
    render(<DateRangeInput label="Range" value={null} onChange={() => {}} />);
    const trigger = getButton(/Range/);
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
  });

  it('trigger has aria-expanded=false by default', () => {
    render(<DateRangeInput label="Range" value={null} onChange={() => {}} />);
    const trigger = getButton(/Range/);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps the optimistic range in the trigger name while saving', async () => {
    const optimisticRange = {
      start: '2026-03-01',
      end: '2026-03-07',
    } as const;
    render(
      <DateRangeInput
        label="Range"
        value={null}
        onChange={() => {}}
        changeAction={async () => new Promise(() => {})}
        presets={[{label: 'Last 7 days', getRange: () => optimisticRange}]}
      />,
    );
    const trigger = getButton(/^Range:/);

    fireEvent.click(getButton('Open calendar'));
    fireEvent.click(getButton('Last 7 days'));

    await waitFor(() => {
      expect(trigger).toHaveTextContent(/Mar.*1.*Mar.*7/);
    });
    expect(trigger).toHaveAccessibleName(/Range:.*Mar.*1.*Mar.*7/);
  });

  it('renders status icon for error status', () => {
    render(
      <DateRangeInput
        label="Range"
        value={null}
        onChange={() => {}}
        status={{type: 'error', message: 'Required'}}
      />,
    );
    const trigger = getButton(/Range/);
    expect(trigger).toHaveAttribute('aria-invalid', 'true');
  });

  it('does not set aria-invalid for warning status', () => {
    render(
      <DateRangeInput
        label="Range"
        value={null}
        onChange={() => {}}
        status={{type: 'warning', message: 'Watch out'}}
      />,
    );
    const trigger = getButton(/Range/);
    expect(trigger).not.toHaveAttribute('aria-invalid');
  });

  it('renders description', () => {
    render(
      <DateRangeInput
        label="Range"
        description="Pick a date range"
        value={null}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('Pick a date range')).toBeInTheDocument();
  });

  it('links status message via aria-describedby', () => {
    render(
      <DateRangeInput
        label="Range"
        value={null}
        onChange={() => {}}
        status={{type: 'error', message: 'Please select dates'}}
      />,
    );
    const trigger = getButton(/Range/);
    const describedBy = trigger.getAttribute('aria-describedby')!;
    const ids = describedBy.split(' ');
    const found = ids.some(id => {
      const el = document.getElementById(id);
      return el?.textContent?.includes('Please select dates');
    });
    expect(found).toBe(true);
  });

  it('calendar icon button is present', () => {
    render(<DateRangeInput label="Range" value={null} onChange={() => {}} />);
    expect(getButton('Open calendar')).toBeInTheDocument();
  });

  it('calendar icon button is disabled when isDisabled', () => {
    render(
      <DateRangeInput
        label="Range"
        isDisabled
        value={null}
        onChange={() => {}}
      />,
    );
    expect(getButton('Open calendar')).not.toHaveAttribute('disabled');
    expect(getButton('Open calendar')).toHaveAttribute('aria-disabled', 'true');
  });

  it('renders with size="lg"', () => {
    render(
      <DateRangeInput
        label="Date range"
        value={null}
        onChange={() => {}}
        size="lg"
      />,
    );
    expect(screen.getByText('Date range')).toBeInTheDocument();
  });

  describe('hasClear', () => {
    it('shows no selected calendar days after clearing', async () => {
      const user = userEvent.setup();
      function ControlledDateRangeInput() {
        const [controlledValue, setControlledValue] =
          useState<DateRange | null>({
            start: '2026-01-01',
            end: '2026-01-03',
          });
        return (
          <DateRangeInput
            label="Range"
            value={controlledValue}
            onChange={setControlledValue}
            min="2026-01-01"
            max="2026-01-31"
            numberOfMonths={1}
          />
        );
      }
      render(<ControlledDateRangeInput />);

      await user.click(getButton('Open calendar'));
      await user.click(getButton(/January 15, 2026/));
      await user.click(getButton(/January 16, 2026/));
      await user.click(getButton('Clear Range'));
      await user.click(getButton('Open calendar'));

      expect(
        screen.queryAllByRole('gridcell', {selected: true, hidden: true}),
      ).toHaveLength(0);
    });

    it('returns focus to the trigger when the clear button is activated by keyboard', async () => {
      const user = userEvent.setup();
      function ControlledDateRangeInput() {
        const [controlledValue, setControlledValue] =
          useState<DateRange | null>({
            start: '2026-01-01',
            end: '2026-01-03',
          });
        return (
          <DateRangeInput
            label="Range"
            value={controlledValue}
            onChange={setControlledValue}
          />
        );
      }
      render(<ControlledDateRangeInput />);

      getButton('Clear Range').focus();
      await user.keyboard('{Enter}');

      expect(queryButton('Clear Range')).not.toBeInTheDocument();
      expect(getButton(/^Range:/)).toHaveFocus();
    });

    it('does not move focus to the trigger when the clear button is clicked', async () => {
      const user = userEvent.setup();
      function ControlledDateRangeInput() {
        const [controlledValue, setControlledValue] =
          useState<DateRange | null>({
            start: '2026-01-01',
            end: '2026-01-03',
          });
        return (
          <DateRangeInput
            label="Range"
            value={controlledValue}
            onChange={setControlledValue}
          />
        );
      }
      render(<ControlledDateRangeInput />);

      await user.click(getButton('Clear Range'));

      expect(queryButton('Clear Range')).not.toBeInTheDocument();
      expect(getButton(/^Range:/)).not.toHaveFocus();
    });

    it('shows clear button when hasClear is true and value exists', () => {
      const range: DateRange = {
        start: '2026-03-15',
        end: '2026-03-22',
      };
      render(
        <DateRangeInput
          label="Range"
          value={range}
          onChange={() => {}}
          hasClear
        />,
      );
      expect(getButton('Clear Range')).toBeInTheDocument();
    });

    it('does not show clear button when value is null', () => {
      render(
        <DateRangeInput
          label="Range"
          value={null}
          onChange={() => {}}
          hasClear
        />,
      );
      expect(queryButton('Clear Range')).not.toBeInTheDocument();
    });

    it('does not show clear button when hasClear is false', () => {
      const range: DateRange = {
        start: '2026-03-15',
        end: '2026-03-22',
      };
      render(
        <DateRangeInput
          label="Range"
          value={range}
          onChange={() => {}}
          hasClear={false}
        />,
      );
      expect(queryButton('Clear Range')).not.toBeInTheDocument();
    });

    it('does not show clear button when disabled', () => {
      const range: DateRange = {
        start: '2026-03-15',
        end: '2026-03-22',
      };
      render(
        <DateRangeInput
          label="Range"
          value={range}
          onChange={() => {}}
          hasClear
          isDisabled
        />,
      );
      expect(queryButton('Clear Range')).not.toBeInTheDocument();
    });

    it('calls onChange with null when clear is clicked', () => {
      const onChange = vi.fn();
      const range: DateRange = {
        start: '2026-03-15',
        end: '2026-03-22',
      };
      render(
        <DateRangeInput
          label="Range"
          value={range}
          onChange={onChange}
          hasClear
        />,
      );
      fireEvent.click(getButton('Clear Range'));
      expect(onChange).toHaveBeenCalledWith(null);
    });
  });

  describe('presets', () => {
    const presets = [
      {
        label: 'Last 7 days',
        getRange: (): DateRange => ({
          start: '2026-03-01',
          end: '2026-03-07',
        }),
      },
      {
        label: 'This month',
        getRange: (): DateRange => ({
          start: '2026-03-01',
          end: '2026-03-31',
        }),
      },
    ];

    it('renders presets as a labeled group of buttons, not a listbox (forms-5)', () => {
      render(
        <DateRangeInput
          label="Range"
          value={null}
          onChange={() => {}}
          presets={presets}
        />,
      );
      // The preset sidebar is a group of action buttons — not a listbox of
      // options (which would announce a Tab-navigable listbox it isn't).
      expect(
        screen.queryByRole('listbox', {hidden: true}),
      ).not.toBeInTheDocument();
      const group = screen.getByRole('group', {
        name: 'Preset date ranges',
        hidden: true,
      });
      expect(group).toBeInTheDocument();
      expect(group).toHaveClass('astryx-date-range-input-presets');
      expect(getButton('Last 7 days')).toHaveClass(
        'astryx-date-range-input-preset',
      );
    });

    it('marks the applied preset with aria-current, not aria-selected', () => {
      render(
        <DateRangeInput
          label="Range"
          value={{start: '2026-03-01', end: '2026-03-07'}}
          onChange={() => {}}
          presets={presets}
        />,
      );
      const active = getButton('Last 7 days');
      expect(active).toHaveClass('astryx-date-range-input-preset');
      expect(active).toHaveAttribute('data-selected', 'selected');
      expect(active).toHaveAttribute('aria-current', 'true');
      expect(active).not.toHaveAttribute('aria-selected');
      const inactive = getButton('This month');
      expect(inactive).toHaveClass('astryx-date-range-input-preset');
      expect(inactive).not.toHaveAttribute('data-selected');
      expect(inactive).not.toHaveAttribute('data-disabled');
      expect(inactive).not.toHaveAttribute('aria-current');
    });

    it('disables a preset when its start is before min', () => {
      const handleChange = vi.fn();
      render(
        <DateRangeInput
          label="Range"
          value={null}
          onChange={handleChange}
          min="2026-03-02"
          presets={[presets[0]]}
        />,
      );

      const preset = getButton('Last 7 days');
      expect(preset).not.toHaveAttribute('disabled');
      expect(preset).toHaveAttribute('aria-disabled', 'true');
      fireEvent.click(preset);
      expect(handleChange).not.toHaveBeenCalled();
    });

    it('disables a preset when its end is after max', () => {
      const handleChange = vi.fn();
      render(
        <DateRangeInput
          label="Range"
          value={null}
          onChange={handleChange}
          max="2026-03-06"
          presets={[presets[0]]}
        />,
      );

      const preset = getButton('Last 7 days');
      expect(preset).not.toHaveAttribute('disabled');
      expect(preset).toHaveAttribute('aria-disabled', 'true');
      fireEvent.click(preset);
      expect(handleChange).not.toHaveBeenCalled();
    });

    it('disables a preset when either endpoint fails dateConstraints', () => {
      const handleChange = vi.fn();
      render(
        <DateRangeInput
          label="Range"
          value={null}
          onChange={handleChange}
          dateConstraints={[date => date.getDate() !== 7]}
          presets={[presets[0]]}
        />,
      );

      const preset = getButton('Last 7 days');
      expect(preset).not.toHaveAttribute('disabled');
      expect(preset).toHaveAttribute('aria-disabled', 'true');
      fireEvent.click(preset);
      expect(handleChange).not.toHaveBeenCalled();
    });

    it('commits an enabled preset using its already-resolved range', () => {
      const range = {start: '2026-03-01', end: '2026-03-07'} as const;
      const getRange = vi.fn(() => range);
      let getRangeCallsAtChange = 0;
      const handleChange = vi.fn(() => {
        getRangeCallsAtChange = getRange.mock.calls.length;
      });
      render(
        <DateRangeInput
          label="Range"
          value={null}
          onChange={handleChange}
          min="2026-03-01"
          max="2026-03-31"
          dateConstraints={[date => date.getDate() !== 13]}
          minRangeSpan={2}
          maxRangeSpan={7}
          presets={[{label: 'Allowed range', getRange}]}
        />,
      );

      const getRangeCallsBeforeClick = getRange.mock.calls.length;
      const preset = getButton('Allowed range');
      expect(preset).not.toHaveAttribute('aria-disabled');
      fireEvent.click(preset);
      expect(handleChange).toHaveBeenCalledWith(range);
      expect(getRangeCallsAtChange).toBe(getRangeCallsBeforeClick);
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

    function renderDisabled(props?: {
      disabledMessage?: string;
      onClick?: () => void;
    }) {
      return render(
        <DateRangeInput
          label="Range"
          value={null}
          onChange={() => {}}
          isDisabled
          {...props}
        />,
      );
    }

    it('shows the reason tooltip on hover when disabled with a reason', async () => {
      renderDisabled({disabledMessage: 'You need the Editor role'});

      const trigger = getButton(/Range:/);
      const container = trigger.parentElement as HTMLElement;
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
      renderDisabled({disabledMessage: 'You need the Editor role'});

      const tooltip = screen.getByRole('tooltip', h);
      await user.tab();
      expect(getButton(/Range:/)).toHaveFocus();
      await waitFor(() => {
        expect(tooltip).toHaveAttribute('popover-open');
      });
    });

    it('does not render a tooltip when not disabled', () => {
      render(
        <DateRangeInput
          label="Range"
          value={null}
          onChange={() => {}}
          disabledMessage="You need the Editor role"
        />,
      );
      expect(screen.queryByRole('tooltip', h)).not.toBeInTheDocument();
    });

    it('does not render a tooltip when disabled without a reason', () => {
      renderDisabled();
      expect(screen.queryByRole('tooltip', h)).not.toBeInTheDocument();
    });

    it('keeps the trigger focusable via aria-disabled when a reason is provided', () => {
      renderDisabled({disabledMessage: 'You need the Editor role'});
      const trigger = getButton(/Range:/);
      expect(trigger).not.toBeDisabled();
      expect(trigger).toHaveAttribute('aria-disabled', 'true');
    });

    it('links the reason tooltip from the trigger via aria-describedby', () => {
      renderDisabled({disabledMessage: 'You need the Editor role'});
      const trigger = getButton(/Range:/);
      const tooltip = screen.getByRole('tooltip', h);
      expect(trigger.getAttribute('aria-describedby')).toContain(tooltip.id);
    });

    it('blocks activation while focusable-disabled', async () => {
      const user = userEvent.setup();
      renderDisabled({disabledMessage: 'You need the Editor role'});

      const trigger = getButton(/Range:/);
      await user.click(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'false');

      await user.keyboard('{Enter}');
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

    it('blocks activation and a caller onClick when disabled without a reason (AST-085 FR1, FR2)', async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      renderDisabled({onClick});
      const trigger = getButton(/Range:/);
      expect(trigger).not.toHaveAttribute('disabled');
      await user.click(trigger);
      await user.keyboard('{Enter}');
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(onClick).not.toHaveBeenCalled();
    });

    it('blocks the calendar button while disabled (AST-085 FR2)', () => {
      renderDisabled();
      fireEvent.click(getButton('Open calendar'));
      expect(getButton(/Range:/)).toHaveAttribute('aria-expanded', 'false');
    });
  });
});

describe('DateRangeInput calendar while the popover is closed', () => {
  const calendarGrid = () => document.querySelector('[role="grid"]');

  it('renders no calendar until the popover opens, and none after it closes', () => {
    render(
      <DateRangeInput
        label="Range"
        value={{start: '2026-01-05', end: '2026-01-09'}}
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

  it('moves focus into the popover on each open from the toggle', async () => {
    render(
      <DateRangeInput
        label="Range"
        value={{start: '2026-01-05', end: '2026-01-09'}}
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

describe('DateRangeInput statusVariant forwarding', () => {
  it('defaults to attached (status renders with data-variant="attached")', () => {
    const {container} = render(
      <DateRangeInput
        label="Range"
        value={null}
        onChange={() => {}}
        status={{type: 'error', message: 'Required'}}
      />,
    );
    expect(container.querySelector('.astryx-field-status')).toHaveAttribute(
      'data-variant',
      'attached',
    );
  });

  it('forwards statusVariant="detached" to the underlying Field status', () => {
    const {container} = render(
      <DateRangeInput
        label="Range"
        value={null}
        onChange={() => {}}
        status={{type: 'error', message: 'Required'}}
        statusVariant="detached"
      />,
    );
    expect(container.querySelector('.astryx-field-status')).toHaveAttribute(
      'data-variant',
      'detached',
    );
  });

  describe('weekStartsOn', () => {
    // The calendar popover renders in the top layer; jsdom keeps the content in
    // the DOM but role queries skip it, so read the columnheaders directly.
    const openAndReadWeekdays = (container: HTMLElement): (string | null)[] => {
      fireEvent.click(getButton('Open calendar'));
      return Array.from(container.querySelectorAll('[role="columnheader"]'))
        .slice(0, 7)
        .map(h => h.textContent);
    };

    it('defaults to a Sunday-first week', () => {
      const {container} = render(
        <DateRangeInput label="Range" value={null} onChange={() => {}} />,
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
        <DateRangeInput
          label="Range"
          value={null}
          onChange={() => {}}
          weekStartsOn={1}
        />,
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
        <DateRangeInput
          label="Range"
          value={null}
          onChange={() => {}}
          weekStartsOn="mon"
        />,
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

describe('DateRangeInput icon theme targets', () => {
  const RANGE: DateRange = {start: '2026-03-15', end: '2026-03-22'};

  // Resolve a glyph span (the astryx-icon element) inside a given button,
  // independent of the theme target class.
  const iconIn = (button: HTMLElement): HTMLElement => {
    const icon = button.querySelector('.astryx-icon');
    if (icon == null) {
      throw new Error('icon not found');
    }
    return icon as HTMLElement;
  };

  it('renders only astryx-input-clear-icon on the clear glyph', () => {
    render(
      <DateRangeInput
        label="Range"
        value={RANGE}
        onChange={() => {}}
        hasClear
      />,
    );
    // The canonical target lands on the icon element itself (not the button),
    // so a theme can restyle just this glyph (color, size, hover) via
    // defineTheme — a button-level target could not reach the icon's own
    // color/size.
    const icon = iconIn(getButton('Clear Range'));
    expect(icon).toHaveClass('astryx-input-clear-icon');
    expect(icon).not.toHaveClass('astryx-date-range-input-clear-icon');
    expect(icon).toHaveClass('astryx-icon');
  });

  it('renders astryx-date-range-input-toggle-icon on the calendar-toggle glyph, reflecting state', () => {
    render(<DateRangeInput label="Range" value={null} onChange={() => {}} />);
    const icon = iconIn(getButton('Open calendar'));
    expect(icon).toHaveClass('astryx-date-range-input-toggle-icon');
    expect(icon).toHaveClass('astryx-icon');
    // Closed by default → data-state="collapsed".
    expect(icon).toHaveAttribute('data-state', 'collapsed');
  });

  it('routes the clear glyph through the shared clear button (default look unchanged)', () => {
    // Default-look guard for the clear affordance. It now composes the shared
    // InputClearButton (a ghost Button with a secondary/sm glyph), so aside
    // from its canonical target class the glyph matches a standalone
    // `secondary`/`sm` close icon — the default clear look is defined once, in
    // InputClearButton.
    // (The calendar-toggle glyph is covered separately.)
    render(
      <DateRangeInput
        label="Range"
        value={RANGE}
        onChange={() => {}}
        hasClear
      />,
    );
    const clearIcon = iconIn(getButton('Clear Range'));

    const {container: clearRefContainer} = render(
      <Icon icon="close" size="sm" color="secondary" />,
    );
    const clearRefIcon = clearRefContainer.querySelector(
      '.astryx-icon',
    ) as HTMLElement;

    const styleClasses = (el: HTMLElement) =>
      el.className
        .split(' ')
        .filter(c => c !== 'astryx-input-clear-icon')
        .sort();

    expect(styleClasses(clearIcon)).toEqual(styleClasses(clearRefIcon));
  });

  it('exposes the icon targets so a theme reaches icon color, size, and hover', () => {
    // jsdom cannot resolve the @layer cascade, so the DOM-class assertions
    // above (targets land on the icon elements) plus this generation assertion
    // (the theme emits same-element icon rules in @layer astryx-theme) together
    // prove the seam: a same-element theme rule wins over the icon's own
    // base-layer color/size.
    const theme = defineTheme({
      name: 'date-range-input-icon-test',
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
        'date-range-input-toggle-icon': {
          base: {width: '14px', height: '14px', fontSize: '14px'},
        },
      },
    });
    const css = generateThemeTestCSS(theme);
    expect(css).toContain('.astryx-input-clear-icon');
    expect(css).toContain('.astryx-date-range-input-toggle-icon');
    expect(css).toContain(':hover');
    expect(css).toContain('12px');
    expect(css).toContain('14px');
  });
});

describe('DateRangeInput disabled theme state', () => {
  it('reflects disabled on the root target so themes can gate paint on it', () => {
    const {container} = render(
      <DateRangeInput
        label="Range"
        value={null}
        onChange={() => {}}
        isDisabled
      />,
    );
    const root = container.querySelector('.astryx-date-range-input');
    expect(root).toHaveAttribute('data-disabled', 'disabled');
  });

  it('omits data-disabled when enabled, like status does', () => {
    const {container} = render(
      <DateRangeInput label="Range" value={null} onChange={() => {}} />,
    );
    const root = container.querySelector('.astryx-date-range-input');
    expect(root).not.toHaveAttribute('data-disabled');
  });
});

describe('DateRangeInput range-span forwarding', () => {
  // Pin "today" so the popover opens on a known month and the day buttons we
  // query are guaranteed to render.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-05T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // The calendar renders in the top layer; jsdom keeps day buttons in the DOM
  // but role queries skip them, so reach them by their machine-readable
  // data-date (ISO) attribute — the same approach Calendar's own tests use.
  const dayButton = (iso: string): HTMLButtonElement | null =>
    document.querySelector<HTMLButtonElement>(`button[data-date="${iso}"]`);

  it('allows selecting a one-day range when minRangeSpan is 1', () => {
    const handleChange = vi.fn();
    render(
      <DateRangeInput
        label="Reporting period"
        value={null}
        onChange={handleChange}
        minRangeSpan={1}
        numberOfMonths={1}
      />,
    );

    fireEvent.click(getButton('Open calendar'));
    fireEvent.click(dayButton('2026-01-10') as HTMLButtonElement);
    fireEvent.click(dayButton('2026-01-10') as HTMLButtonElement);

    expect(handleChange).toHaveBeenCalledWith({
      start: '2026-01-10',
      end: '2026-01-10',
    });
  });

  it('forwards maxRangeSpan so the window caps after a start is picked', () => {
    render(
      <DateRangeInput
        label="Reporting period"
        value={null}
        onChange={() => {}}
        maxRangeSpan={7}
      />,
    );

    fireEvent.click(getButton('Open calendar'));

    // Before a start is picked, a far-off day is selectable.
    expect(dayButton('2026-01-20')).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );

    fireEvent.click(dayButton('2026-01-10') as HTMLButtonElement);

    // A 7-day window spans start ± 6 days: Jan 16 is the edge, Jan 17 is out.
    expect(dayButton('2026-01-16')).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(dayButton('2026-01-17')).toHaveAttribute('aria-disabled', 'true');
  });

  it('disables a preset whose range violates the span cap', () => {
    const presets = [
      {
        label: 'Last 3 days',
        getRange: (): DateRange => ({
          start: '2026-01-08',
          end: '2026-01-10',
        }),
      },
      {
        label: 'Last 30 days',
        getRange: (): DateRange => ({
          start: '2025-12-12',
          end: '2026-01-10',
        }),
      },
    ];
    const handleChange = vi.fn();
    render(
      <DateRangeInput
        label="Reporting period"
        value={null}
        onChange={handleChange}
        maxRangeSpan={7}
        presets={presets}
      />,
    );

    fireEvent.click(getButton('Open calendar'));

    // The 3-day preset fits the 7-day cap; the 30-day preset can't be committed.
    const withinCap = getButton('Last 3 days');
    const overCap = getButton('Last 30 days');
    expect(withinCap).not.toHaveAttribute('aria-disabled');
    expect(withinCap).not.toHaveAttribute('data-disabled');
    expect(overCap).not.toHaveAttribute('disabled');
    expect(overCap).toHaveAttribute('aria-disabled', 'true');
    expect(overCap).toHaveClass('astryx-date-range-input-preset');
    expect(overCap).toHaveAttribute('data-disabled', 'disabled');

    fireEvent.click(overCap);
    expect(handleChange).not.toHaveBeenCalled();
  });
});
