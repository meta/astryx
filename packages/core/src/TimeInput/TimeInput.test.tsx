// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TimeInput.test.tsx
 * @input Uses vitest, @testing-library/react, TimeInput component
 * @output Unit tests for TimeInput component behavior
 * @position Testing; validates TimeInput.tsx implementation
 *
 * SYNC: When TimeInput.tsx changes, update tests to match new behavior
 */

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {act, render, screen, fireEvent, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as stylex from '@stylexjs/stylex';
import {colorVars} from '../theme/tokens.stylex';
import {TimeInput} from './TimeInput';
import {InputGroup, InputGroupText} from '../InputGroup';
import {InternationalizationProvider} from '../i18n';
import type {ISOTimeString} from '../utils';
import {__resetLiveRegionsForTest} from '../hooks/useAnnounce';

function politeRegion(): HTMLElement | null {
  return document.querySelector('[data-astryx-live-region="polite"]');
}
function assertiveRegion(): HTMLElement | null {
  return document.querySelector('[data-astryx-live-region="assertive"]');
}

afterEach(() => {
  __resetLiveRegionsForTest();
});

describe('TimeInput', () => {
  it('renders with label', () => {
    render(<TimeInput label="Time" onChange={() => {}} />);
    expect(screen.getByLabelText('Time')).toBeInTheDocument();
  });

  it('renders with placeholder', () => {
    render(
      <TimeInput label="Time" onChange={() => {}} placeholder="Pick a time" />,
    );
    expect(screen.getByPlaceholderText('Pick a time')).toBeInTheDocument();
  });

  it('does not step the time on a composing ArrowUp/ArrowDown (IME)', () => {
    const onChange = vi.fn();
    render(
      <TimeInput
        label="Time"
        value={'14:30' as ISOTimeString}
        onChange={onChange}
      />,
    );
    const input = screen.getByLabelText('Time');

    // An IME candidate window navigates with the arrows; a composing keydown
    // (isComposing / legacy keyCode 229) must not step the time value.
    fireEvent.keyDown(input, {key: 'ArrowUp', isComposing: true});
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(input, {key: 'ArrowDown', keyCode: 229});
    expect(onChange).not.toHaveBeenCalled();

    // A real, non-composing ArrowUp still steps the time by one minute.
    fireEvent.keyDown(input, {key: 'ArrowUp'});
    expect(onChange).toHaveBeenCalledWith('14:31');
  });

  it('does not step into a fractional minute when increment is fractional', () => {
    const onChange = vi.fn();
    render(
      <TimeInput
        label="Time"
        value={'14:30' as ISOTimeString}
        increment={0.5}
        onChange={onChange}
      />,
    );
    const input = screen.getByLabelText('Time');

    // `increment` is documented as minutes and typed `number`. A fractional one
    // used to reach formatISOTime unrounded, which pads "30.5" to two
    // characters and leaves it, so the arrow key handed the consumer a value
    // that is no longer a time at all.
    fireEvent.keyDown(input, {key: 'ArrowUp'});
    expect(onChange).toHaveBeenCalledWith('14:30');
  });

  it('displays formatted time in 12h format', () => {
    render(
      <TimeInput
        label="Time"
        value={'14:30' as ISOTimeString}
        onChange={() => {}}
      />,
    );
    expect(screen.getByDisplayValue('2:30 PM')).toBeInTheDocument();
  });

  it('displays formatted time in 24h format', () => {
    render(
      <TimeInput
        label="Time"
        value={'14:30' as ISOTimeString}
        onChange={() => {}}
        hourFormat="24h"
      />,
    );
    expect(screen.getByDisplayValue('14:30')).toBeInTheDocument();
  });

  it('displays time with seconds', () => {
    render(
      <TimeInput
        label="Time"
        value={'14:30:45' as ISOTimeString}
        onChange={() => {}}
        hasSeconds
      />,
    );
    expect(screen.getByDisplayValue('2:30:45 PM')).toBeInTheDocument();
  });

  it('forwards ref correctly', () => {
    const ref = vi.fn();
    render(<TimeInput ref={ref} label="Time" onChange={() => {}} />);
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLInputElement));
  });

  it('visually hides label when isLabelHidden is true', () => {
    render(<TimeInput label="Time" isLabelHidden onChange={() => {}} />);
    const label = screen.getByText('Time');
    expect(label).toBeInTheDocument();
    expect(screen.getByLabelText('Time')).toBeInTheDocument();
  });

  it('sets aria-required when isRequired is true', () => {
    render(<TimeInput label="Time" isRequired onChange={() => {}} />);
    expect(screen.getByRole('textbox')).toHaveAttribute(
      'aria-required',
      'true',
    );
  });

  it('keeps a disabled input focusable without native disabled (AST-085 FR1)', () => {
    render(<TimeInput label="Time" isDisabled onChange={() => {}} />);
    const input = screen.getByRole('textbox');
    expect(input).not.toHaveAttribute('disabled');
    expect(input).toHaveAttribute('aria-disabled', 'true');
    expect(input).toHaveAttribute('readonly');
    input.focus();
    expect(input).toHaveFocus();
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
    render(<TimeInput label="Time" isDisabled onChange={() => {}} />);
    const wrapper = screen.getByRole('textbox').closest('.astryx-time-input')!;
    for (const name of ringClasses) {
      expect(wrapper).toHaveClass(name);
    }
  });

  it('shows clear button when hasClear is true and value exists', () => {
    render(
      <TimeInput
        label="Time"
        value={'14:30' as ISOTimeString}
        onChange={() => {}}
        hasClear
      />,
    );
    expect(
      screen.getByRole('button', {name: 'Clear Time'}),
    ).toBeInTheDocument();
  });

  it('does not show clear button when value is empty', () => {
    render(<TimeInput label="Time" onChange={() => {}} hasClear />);
    expect(
      screen.queryByRole('button', {name: 'Clear Time'}),
    ).not.toBeInTheDocument();
  });

  it('calls onChange with undefined when clear button is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TimeInput
        label="Time"
        value={'14:30' as ISOTimeString}
        onChange={onChange}
        hasClear
      />,
    );

    await user.click(screen.getByRole('button', {name: 'Clear Time'}));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('does not call onChange while typing invalid input', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TimeInput label="Time" onChange={onChange} />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'invalid');

    // onChange should not be called while typing
    expect(onChange).not.toHaveBeenCalled();
  });

  it('reverts to previous value on blur when input is invalid', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TimeInput
        label="Time"
        value={'14:30' as ISOTimeString}
        onChange={onChange}
      />,
    );

    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'not a time');
    await user.tab(); // blur

    // Should revert to the original value, not call onChange
    expect(screen.getByDisplayValue('2:30 PM')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('sets aria-invalid="true" when typed input is out of range', () => {
    render(<TimeInput label="Time" onChange={() => {}} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, {target: {value: '25:99'}});

    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('does not set aria-invalid when typed input is a valid time', () => {
    render(<TimeInput label="Time" onChange={() => {}} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, {target: {value: '3:45 pm'}});

    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('announces an alert message when typed input is invalid', () => {
    render(<TimeInput label="Time" onChange={() => {}} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, {target: {value: '25:99'}});

    expect(screen.getByRole('alert')).toHaveTextContent('Invalid time');
  });

  it('does not announce an alert message when input is valid', () => {
    render(<TimeInput label="Time" onChange={() => {}} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, {target: {value: '3:45 pm'}});

    expect(screen.getByRole('alert')).toHaveTextContent('');
    expect(screen.queryByText('Invalid time')).not.toBeInTheDocument();
  });

  it('resolves the invalid-time announcement from the i18n catalog', () => {
    render(
      <InternationalizationProvider
        locale="en"
        overrides={{en: {'@astryx.timeInput.invalidTime': 'Ungültige Zeit'}}}>
        <TimeInput label="Time" onChange={() => {}} />
      </InternationalizationProvider>,
    );

    fireEvent.change(screen.getByRole('textbox'), {target: {value: '25:99'}});

    expect(screen.getByRole('alert')).toHaveTextContent('Ungültige Zeit');
  });

  // Arrow-key stepping mutates a plain textbox programmatically, and screen
  // readers do not announce programmatic textbox changes — the new value must
  // be announced through the polite live region (WCAG 4.1.2).
  it('politely announces the new time after ArrowUp stepping', async () => {
    const onChange = vi.fn();
    render(
      <TimeInput
        label="Time"
        value={'14:30' as ISOTimeString}
        onChange={onChange}
      />,
    );

    fireEvent.keyDown(screen.getByRole('textbox'), {key: 'ArrowUp'});

    expect(onChange).toHaveBeenCalledWith('14:31');
    await waitFor(() => {
      expect(politeRegion()).toHaveTextContent('2:31 PM');
    });
  });

  it('politely announces the new time after ArrowDown stepping', async () => {
    const onChange = vi.fn();
    render(
      <TimeInput
        label="Time"
        value={'14:30' as ISOTimeString}
        onChange={onChange}
      />,
    );

    fireEvent.keyDown(screen.getByRole('textbox'), {key: 'ArrowDown'});

    expect(onChange).toHaveBeenCalledWith('14:29');
    await waitFor(() => {
      expect(politeRegion()).toHaveTextContent('2:29 PM');
    });
  });

  it('calls onChange on blur when input is valid', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TimeInput label="Time" onChange={onChange} />);

    const input = screen.getByRole('textbox');
    await user.type(input, '3:45 pm');
    await user.tab(); // blur

    expect(onChange).toHaveBeenCalledWith('15:45');
  });

  it('calls onChange immediately when input becomes valid', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TimeInput label="Time" onChange={onChange} />);

    const input = screen.getByRole('textbox');
    await user.type(input, '3:45 pm');

    // onChange should be called immediately when input is valid, not waiting for blur
    expect(onChange).toHaveBeenCalledWith('15:45');
  });

  it('focuses input when clicking the clock icon', () => {
    render(<TimeInput label="Time" onChange={() => {}} />);

    const input = screen.getByRole('textbox');
    const wrapper = input.parentElement!;
    // The icon container is the first child div (before the input)
    const iconContainer = wrapper.querySelector(':scope > div') as HTMLElement;

    fireEvent.click(iconContainer);
    expect(input).toHaveFocus();
  });

  it('focuses input when clicking the wrapper padding', () => {
    render(<TimeInput label="Time" onChange={() => {}} />);

    const input = screen.getByRole('textbox');
    const wrapper = input.parentElement!;

    // Simulate clicking padding area by dispatching click directly on wrapper
    // with wrapper as both target and currentTarget
    fireEvent.click(wrapper);
    expect(input).toHaveFocus();
  });
  describe('InputGroup integration', () => {
    it('labels grouped TimeInput from the group and inner input labels', () => {
      render(
        <InputGroup label="Schedule" description="Use local time">
          <InputGroupText>Starts</InputGroupText>
          <TimeInput
            label="Start time"
            isLabelHidden
            value={'09:00' as ISOTimeString}
            onChange={() => {}}
          />
        </InputGroup>,
      );

      const group = screen.getByRole('group', {name: 'Schedule'});
      const groupLabelID = group.getAttribute('aria-labelledby');
      const input = screen.getByRole('textbox', {
        name: 'Schedule Start time',
      });
      const labelledByIDs =
        input.getAttribute('aria-labelledby')?.split(' ') ?? [];

      expect(labelledByIDs).toHaveLength(2);
      expect(labelledByIDs[0]).toBe(groupLabelID);
      expect(document.getElementById(labelledByIDs[1])).toHaveTextContent(
        'Start time',
      );
      expect(input).not.toHaveAttribute('aria-label');
      expect(input).toHaveAttribute(
        'aria-describedby',
        group.getAttribute('aria-describedby'),
      );
    });

    it('includes group and local described-by content when grouped', () => {
      render(
        <InputGroup
          label="Schedule"
          description="Use local time"
          status={{type: 'warning', message: 'Schedule is unusual'}}>
          <InputGroupText>Starts</InputGroupText>
          <TimeInput
            label="Start time"
            isLabelHidden
            value={'09:00' as ISOTimeString}
            onChange={() => {}}
            description="Business hours only"
            status={{type: 'error', message: 'Start time is required'}}
            isDisabled
            disabledMessage="Time edits are locked"
          />
        </InputGroup>,
      );

      const input = screen.getByRole('textbox', {
        name: 'Schedule Start time',
      });
      const describedByIDs =
        input.getAttribute('aria-describedby')?.split(' ') ?? [];
      const describedText = describedByIDs
        .map(id => document.getElementById(id)?.textContent)
        .join(' ');

      expect(describedText).toContain('Use local time');
      expect(describedText).toContain('Schedule is unusual');
      expect(describedText).toContain('Business hours only');
      expect(describedText).toContain('Start time is required');
      expect(describedText).toContain('Time edits are locked');
    });

    it('does not render duplicate Field label chrome when grouped', () => {
      render(
        <InputGroup label="Schedule">
          <InputGroupText>Starts</InputGroupText>
          <TimeInput
            label="Start time"
            isLabelHidden
            value={'09:00' as ISOTimeString}
            onChange={() => {}}
          />
        </InputGroup>,
      );

      expect(screen.getByText('Schedule')).toBeInTheDocument();
      expect(screen.getByText('Start time')).toBeInTheDocument();
      expect(screen.getByText('Start time').tagName).toBe('SPAN');
      expect(document.querySelector('label')).toBeNull();
    });

    it('suppresses the local status icon when grouped', () => {
      const {container} = render(
        <InputGroup label="Schedule">
          <InputGroupText>Starts</InputGroupText>
          <TimeInput
            label="Start time"
            isLabelHidden
            value={'09:00' as ISOTimeString}
            onChange={() => {}}
            status={{type: 'error'}}
          />
        </InputGroup>,
      );

      // The clock icon remains, but the trailing status icon is suppressed in
      // grouped mode so the shared InputGroup border/status treatment is not
      // duplicated.
      expect(container.querySelectorAll('svg')).toHaveLength(1);
    });

    // The grouped status node exists only for aria-describedby; announcing
    // happens through the persistent useAnnounce regions because a live
    // region mounted together with its content is not reliably announced.
    it('keeps the grouped status node role-free while announcing via the persistent region', async () => {
      render(
        <InputGroup label="Schedule">
          <InputGroupText>Starts</InputGroupText>
          <TimeInput
            label="Start time"
            isLabelHidden
            value={'09:00' as ISOTimeString}
            onChange={() => {}}
            status={{type: 'error', message: 'Start time is required'}}
          />
        </InputGroup>,
      );

      const input = screen.getByRole('textbox', {
        name: 'Schedule Start time',
      });
      const describedByIDs =
        input.getAttribute('aria-describedby')?.split(' ') ?? [];
      const statusNode = describedByIDs
        .map(id => document.getElementById(id))
        .find(el => el?.textContent === 'Start time is required');
      expect(statusNode).toBeTruthy();
      expect(statusNode).not.toHaveAttribute('role');
      expect(statusNode).not.toHaveAttribute('aria-live');

      await waitFor(() => {
        expect(assertiveRegion()).toHaveTextContent('Start time is required');
      });
    });

    // Regression: a grouped status message appearing after mount (the common
    // validation flow) must land in the persistent announce region.
    it('announces a grouped status message that appears after mount', async () => {
      const grouped = (status?: {
        type: 'error' | 'warning';
        message: string;
      }) => (
        <InputGroup label="Schedule">
          <InputGroupText>Starts</InputGroupText>
          <TimeInput
            label="Start time"
            isLabelHidden
            value={'09:00' as ISOTimeString}
            onChange={() => {}}
            status={status}
          />
        </InputGroup>
      );
      const {rerender} = render(grouped());
      expect(politeRegion()).toBeNull();

      rerender(grouped({type: 'warning', message: 'Schedule is unusual'}));
      await waitFor(() => {
        expect(politeRegion()).toHaveTextContent('Schedule is unusual');
      });
      // Non-error statuses stay on the polite channel.
      expect(assertiveRegion()).toHaveTextContent('');
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
        <TimeInput
          label="Time"
          isDisabled
          disabledMessage="You need the Editor role"
        />,
      );

      const container = screen.getByLabelText('Time')
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
        <TimeInput
          label="Time"
          isDisabled
          disabledMessage="You need the Editor role"
        />,
      );

      const tooltip = screen.getByRole('tooltip', h);
      await user.tab();
      expect(screen.getByLabelText('Time')).toHaveFocus();
      await waitFor(() => {
        expect(tooltip).toHaveAttribute('popover-open');
      });
    });

    it('does not render a tooltip when not disabled', () => {
      render(
        <TimeInput label="Time" disabledMessage="You need the Editor role" />,
      );
      expect(screen.queryByRole('tooltip', h)).not.toBeInTheDocument();
    });

    it('does not render a tooltip when disabled without a reason', () => {
      render(<TimeInput label="Time" isDisabled />);
      expect(screen.queryByRole('tooltip', h)).not.toBeInTheDocument();
    });

    it('keeps the input focusable via aria-disabled when a reason is provided', () => {
      render(
        <TimeInput
          label="Time"
          isDisabled
          disabledMessage="You need the Editor role"
        />,
      );
      const input = screen.getByLabelText('Time');
      expect(input).not.toBeDisabled();
      expect(input).toHaveAttribute('aria-disabled', 'true');
      expect(input).toHaveAttribute('readonly');
    });

    it('links the reason tooltip from the input via aria-describedby', () => {
      render(
        <TimeInput
          label="Time"
          isDisabled
          disabledMessage="You need the Editor role"
        />,
      );
      const input = screen.getByLabelText('Time');
      const tooltip = screen.getByRole('tooltip', h);
      expect(input.getAttribute('aria-describedby')).toContain(tooltip.id);
    });

    it('blocks typing and arrow-key changes while focusable-disabled', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <TimeInput
          label="Time"
          onChange={onChange}
          isDisabled
          disabledMessage="You need the Editor role"
        />,
      );

      const input = screen.getByLabelText('Time');
      await user.type(input, '2:30 PM');
      expect(input).toHaveValue('');
      input.focus();
      fireEvent.keyDown(input, {key: 'ArrowUp'});
      expect(onChange).not.toHaveBeenCalled();
    });

    it('blocks typing, arrows and a caller onClick when disabled without a reason (AST-085 FR2)', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      const onClick = vi.fn();
      render(
        <TimeInput
          label="Time"
          value={'09:00' as ISOTimeString}
          onChange={onChange}
          onClick={onClick}
          isDisabled
        />,
      );
      const input = screen.getByLabelText('Time');
      await user.click(input);
      await user.type(input, '1');
      await user.keyboard('{ArrowUp}');
      await user.tab();
      expect(onChange).not.toHaveBeenCalled();
      expect(onClick).not.toHaveBeenCalled();
    });

    it.each([
      ['text-input', false, {isDisabled: true}],
      ['native', true, {isDisabled: true}],
      ['bottom-sheet', true, {isDisabled: true}],
      ['bottom-sheet', true, {isLoading: true}],
    ] as const)(
      'does not submit a surrounding form on Enter: %s (coarse %s) %o (AST-085 FR2)',
      async (presentation, isCoarse, state) => {
        vi.stubGlobal('matchMedia', (query: string) => ({
          matches: /pointer:\s*coarse/.test(query)
            ? isCoarse
            : /pointer:\s*fine/.test(query) && !isCoarse,
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
        }));
        const user = userEvent.setup();
        const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
        render(
          <form onSubmit={onSubmit}>
            <TimeInput
              label="Time"
              presentation={presentation}
              value={'09:00' as ISOTimeString}
              onChange={() => {}}
              {...state}
            />
            <button type="submit">Save</button>
          </form>,
        );
        try {
          const input = document.querySelector<HTMLInputElement>(
            '.astryx-time-input input:not([type=hidden])',
          )!;
          act(() => input.focus());
          await user.keyboard('{Enter}');
          expect(onSubmit).not.toHaveBeenCalled();
        } finally {
          vi.unstubAllGlobals();
        }
      },
    );

    it('drops a draft instead of committing it when the field becomes disabled (AST-085 FR2)', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      const value = '09:00' as ISOTimeString;
      const {rerender} = render(
        <TimeInput label="Time" value={value} onChange={onChange} />,
      );
      const input = screen.getByLabelText('Time');
      await user.click(input);
      await user.clear(input);
      onChange.mockClear();
      rerender(
        <TimeInput label="Time" value={value} onChange={onChange} isDisabled />,
      );
      await user.tab();
      expect(onChange).not.toHaveBeenCalled();
    });

    it('does not swap in the format-hint placeholder on focus while disabled', () => {
      render(
        <TimeInput
          label="Time"
          isDisabled
          disabledMessage="You need the Editor role"
          placeholder="Select a time"
        />,
      );
      const input = screen.getByLabelText('Time');
      input.focus();
      fireEvent.focus(input);
      expect(input).toHaveAttribute('placeholder', 'Select a time');
    });
  });
});

describe('TimeInput statusVariant forwarding', () => {
  it('defaults to attached (status renders with data-variant="attached")', () => {
    const {container} = render(
      <TimeInput
        label="Start"
        value={undefined}
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
      <TimeInput
        label="Start"
        value={undefined}
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
});

describe('TimeInput disabled theme state', () => {
  it('reflects disabled on the root target so themes can gate paint on it', () => {
    const {container} = render(
      <TimeInput label="Time" onChange={() => {}} isDisabled />,
    );
    const root = container.querySelector('.astryx-time-input');
    expect(root).toHaveAttribute('data-disabled', 'disabled');
  });

  it('omits data-disabled when enabled, like status does', () => {
    const {container} = render(<TimeInput label="Time" onChange={() => {}} />);
    const root = container.querySelector('.astryx-time-input');
    expect(root).not.toHaveAttribute('data-disabled');
  });
});

describe('TimeInput locale time text (issue 8992)', () => {
  function renderIn(
    locale: string,
    props: Partial<React.ComponentProps<typeof TimeInput>> = {},
  ) {
    return render(
      <InternationalizationProvider locale={locale}>
        <TimeInput
          label="Time"
          value={'14:30' as ISOTimeString}
          onChange={() => {}}
          presentation="text-input"
          {...props}
        />
      </InternationalizationProvider>,
    );
  }

  it.each([
    ['en-US', '2:30 PM'],
    ['en-GB', '14:30'],
    ['de-DE', '14:30'],
    ['vi-VN', '14:30'],
    ['ko-KR', '오후 2:30'],
  ])(
    'follows the hour cycle of %s when hourFormat is unset',
    (locale, text) => {
      renderIn(locale);
      expect(screen.getByRole('textbox')).toHaveValue(text);
    },
  );

  it('follows a per-user preference carried on the locale tag', () => {
    renderIn('en-US-u-hc-h23');
    expect(screen.getByRole('textbox')).toHaveValue('14:30');
  });

  it('lets an explicit hourFormat win over the locale', () => {
    renderIn('de-DE', {hourFormat: '12h'});
    expect(screen.getByRole('textbox')).toHaveValue('2:30 PM');
  });

  it("writes the locale's day period instead of a fixed English AM/PM", () => {
    renderIn('ja-JP', {hourFormat: '12h'});
    expect(screen.getByRole('textbox')).toHaveValue('午後2:30');
  });

  it('commits an edit of the localized text', () => {
    const onChange = vi.fn();
    renderIn('ko-KR', {onChange});
    const input = screen.getByRole('textbox');
    fireEvent.focus(input);
    fireEvent.change(input, {target: {value: '오전 9:15'}});
    expect(onChange).toHaveBeenLastCalledWith('09:15');
  });

  it('announces a stepped time in the locale text', async () => {
    const onChange = vi.fn();
    renderIn('de-DE', {onChange});
    fireEvent.keyDown(screen.getByRole('textbox'), {key: 'ArrowUp'});
    expect(onChange).toHaveBeenLastCalledWith('14:31');
    await waitFor(() => {
      expect(politeRegion()).toHaveTextContent('14:31');
    });
  });

  it('shows the catalog format hint for the resolved hour format', () => {
    renderIn('de-DE', {value: undefined});
    fireEvent.focus(screen.getByRole('textbox'));
    expect(screen.getByRole('textbox')).toHaveAttribute(
      'placeholder',
      'e.g., 14:30',
    );
  });
});
