// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TextInput.test.tsx
 * @input Uses vitest, @testing-library/react, TextInput component, and the
 *   shared declaredValue StyleX read-back helper
 * @output Unit tests for TextInput component behavior
 * @position Testing; validates TextInput.tsx implementation
 *
 * SYNC: When TextInput.tsx changes, update tests to match new behavior
 */

import {describe, it, expect, vi, beforeEach} from 'vitest';
import {render, screen, fireEvent, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as stylex from '@stylexjs/stylex';
import {colorVars} from '../theme/tokens.stylex';
import {TestIcon} from '../__tests__/TestIcon';
import {declaredValue} from '../__tests__/stylexDeclarations';
import {InputGroup} from '../InputGroup';
import {TextInput} from './TextInput';

// jsdom cannot match `:focus-visible`: compare the ring's StyleX class hash.
const RING = stylex
  .props(
    stylex.create({
      ring: {
        boxShadow: {
          default: null,
          ':has(> [aria-disabled="true"]:focus-visible)': `inset 0px 0px 0px 2px ${colorVars['--color-accent-muted']}`,
        },
      },
    }).ring,
  )
  .className!.split(' ')
  .pop()!;

// Mock showPopover/hidePopover since jsdom does not implement them. Used by the
// disabledMessage tooltip.
beforeEach(() => {
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    this.setAttribute('popover-open', '');
    const event = new Event('toggle', {bubbles: false});
    Object.defineProperty(event, 'newState', {value: 'open'});
    this.dispatchEvent(event);
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    this.removeAttribute('popover-open');
    const event = new Event('toggle', {bubbles: false});
    Object.defineProperty(event, 'newState', {value: 'closed'});
    this.dispatchEvent(event);
  });
  const originalMatches = HTMLElement.prototype.matches;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLElement.prototype as any).matches = function (
    selector: string,
  ): boolean {
    if (selector === ':popover-open') {
      return this.hasAttribute('popover-open');
    }
    return originalMatches.call(this, selector);
  };
});

// jsdom popover content is in the DOM but may not be "visible" in the
// accessibility tree. Use hidden: true to find it.
const h = {hidden: true} as const;

describe('TextInput', () => {
  it('renders with label', () => {
    render(<TextInput label="Name" value="" onChange={() => {}} />);
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });

  it('renders with placeholder', () => {
    render(
      <TextInput
        label="Name"
        value=""
        onChange={() => {}}
        placeholder="Enter text"
      />,
    );
    expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument();
  });

  it('calls onChange with value and event when typing', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<TextInput label="Name" value="" onChange={handleChange} />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'Hi');
    expect(handleChange).toHaveBeenCalledTimes(2);
    expect(handleChange).toHaveBeenLastCalledWith('i', expect.any(Object));
  });

  it('works with state setter function directly', async () => {
    const user = userEvent.setup();
    const setValue = vi.fn();
    render(<TextInput label="Name" value="" onChange={setValue} />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'A');
    expect(setValue).toHaveBeenCalledWith('A', expect.any(Object));
  });

  it('renders empty string when value is undefined', () => {
    // @ts-expect-error — testing runtime safety when value is omitted
    render(<TextInput label="Name" onChange={() => {}} />);
    expect(screen.getByRole('textbox')).toHaveValue('');
  });

  it('displays controlled value', () => {
    render(
      <TextInput label="Name" value="Controlled value" onChange={() => {}} />,
    );
    expect(screen.getByRole('textbox')).toHaveValue('Controlled value');
  });

  it('forwards ref correctly', () => {
    const ref = vi.fn();
    render(<TextInput ref={ref} label="Name" value="" onChange={() => {}} />);
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLInputElement));
  });

  it('visually hides label when isLabelHidden is true', () => {
    render(
      <TextInput label="Search" isLabelHidden value="" onChange={() => {}} />,
    );
    const label = screen.getByText('Search');
    expect(label).toBeInTheDocument();
    // Label should still be accessible
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
  });

  it('shows label visually by default', () => {
    render(<TextInput label="Email" value="" onChange={() => {}} />);
    const label = screen.getByText('Email');
    expect(label).toBeVisible();
  });

  it('sets aria-required when isRequired is true', () => {
    render(
      <TextInput label="Username" isRequired value="" onChange={() => {}} />,
    );
    expect(screen.getByRole('textbox')).toHaveAttribute(
      'aria-required',
      'true',
    );
  });

  it('does not set aria-required when isRequired is false', () => {
    render(<TextInput label="Username" value="" onChange={() => {}} />);
    expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-required');
  });

  it('exposes aria-disabled and read-only, not native disabled, when isDisabled is true', () => {
    render(<TextInput label="Name" isDisabled value="" onChange={() => {}} />);
    const input = screen.getByRole('textbox');
    expect(input).not.toBeDisabled();
    expect(input).toHaveAttribute('aria-disabled', 'true');
    expect(input).toHaveAttribute('readonly');
  });

  it('keeps a disabled input in the tab order (spec:AST-085)', async () => {
    const user = userEvent.setup();
    render(
      <>
        <TextInput label="First" value="" onChange={() => {}} />
        <TextInput label="Second" isDisabled value="" onChange={() => {}} />
        <TextInput label="Third" value="" onChange={() => {}} />
      </>,
    );
    await user.tab();
    await user.tab();
    expect(screen.getByRole('textbox', {name: 'Second'})).toHaveFocus();
  });

  it('runs no caller handler and submits no form from a disabled input (spec:AST-085 FR2)', async () => {
    const user = userEvent.setup();
    const handlers = {onEnter: vi.fn(), onKeyDown: vi.fn(), onPaste: vi.fn()};
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <TextInput
          label="Name"
          isDisabled
          value=""
          onChange={() => {}}
          {...handlers}
        />
      </form>,
    );
    await user.click(screen.getByRole('textbox'));
    await user.keyboard('{Enter}');
    await user.paste('x');
    for (const handler of [...Object.values(handlers), onSubmit]) {
      expect(handler).not.toHaveBeenCalled();
    }
  });

  it('rings a disabled input under keyboard focus (spec:AST-085 FR6)', () => {
    render(<TextInput label="Name" isDisabled value="" onChange={() => {}} />);
    const wrapper = screen.getByRole('textbox').parentElement!;
    expect(wrapper).toHaveClass(RING);
  });

  it('does not fire onChange when disabled', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <TextInput label="Name" isDisabled value="" onChange={handleChange} />,
    );

    const input = screen.getByRole('textbox');
    await user.type(input, 'test');
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('is not disabled by default', () => {
    render(<TextInput label="Name" value="" onChange={() => {}} />);
    expect(screen.getByRole('textbox')).not.toBeDisabled();
  });

  it('renders with startIcon', () => {
    render(
      <TextInput
        label="Search"
        value=""
        onChange={() => {}}
        startIcon={TestIcon}
      />,
    );
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    // Icon should be rendered (as an SVG element)
    const svg = document.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('renders without icon wrapper when startIcon is not provided', () => {
    const {container} = render(
      <TextInput label="Name" value="" onChange={() => {}} />,
    );
    // No SVG should be present
    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });

  describe('status prop', () => {
    it('renders with error status icon', () => {
      const {container} = render(
        <TextInput
          label="Email"
          value=""
          onChange={() => {}}
          status={{type: 'error'}}
        />,
      );
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('renders with warning status icon', () => {
      const {container} = render(
        <TextInput
          label="Email"
          value=""
          onChange={() => {}}
          status={{type: 'warning'}}
        />,
      );
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('renders with success status icon', () => {
      const {container} = render(
        <TextInput
          label="Email"
          value=""
          onChange={() => {}}
          status={{type: 'success'}}
        />,
      );
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('renders status message when provided', () => {
      render(
        <TextInput
          label="Email"
          value=""
          onChange={() => {}}
          status={{type: 'error', message: 'Invalid email address'}}
        />,
      );
      expect(screen.getByText('Invalid email address')).toBeInTheDocument();
    });

    it('has no dangling aria-describedby ids inside InputGroup (WCAG 1.3.1)', () => {
      // Inside an InputGroup no Field renders, so the status message element
      // does not exist; aria-describedby must not reference its id.
      render(
        <InputGroup label="Contact">
          <TextInput
            label="Email"
            value=""
            onChange={() => {}}
            status={{type: 'error', message: 'Invalid email address'}}
          />
        </InputGroup>,
      );
      const input = screen.getByRole('textbox');
      const describedBy = input.getAttribute('aria-describedby') ?? '';
      for (const idToken of describedBy.split(/\s+/).filter(Boolean)) {
        expect(document.getElementById(idToken)).not.toBeNull();
      }
    });

    it('does not render status message when not provided', () => {
      render(
        <TextInput
          label="Email"
          value=""
          onChange={() => {}}
          status={{type: 'error'}}
        />,
      );
      expect(screen.queryByText(/invalid/i)).not.toBeInTheDocument();
    });

    it('sets aria-invalid when status type is error', () => {
      render(
        <TextInput
          label="Email"
          value=""
          onChange={() => {}}
          status={{type: 'error'}}
        />,
      );
      expect(screen.getByRole('textbox')).toHaveAttribute(
        'aria-invalid',
        'true',
      );
    });

    it('does not set aria-invalid for warning status', () => {
      render(
        <TextInput
          label="Email"
          value=""
          onChange={() => {}}
          status={{type: 'warning'}}
        />,
      );
      expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-invalid');
    });

    it('does not set aria-invalid for success status', () => {
      render(
        <TextInput
          label="Email"
          value=""
          onChange={() => {}}
          status={{type: 'success'}}
        />,
      );
      expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-invalid');
    });

    it('includes status message in aria-describedby', () => {
      render(
        <TextInput
          label="Email"
          value=""
          onChange={() => {}}
          status={{type: 'error', message: 'Invalid email'}}
        />,
      );
      const input = screen.getByRole('textbox');
      const describedBy = input.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();
      // The status message should be reachable via the described-by ID
      const messageElement = screen.getByText('Invalid email');
      expect(messageElement).toHaveAttribute('id');
      expect(describedBy).toContain(messageElement.id);
    });
  });

  it('renders tooltip info icon when labelTooltip is provided', () => {
    render(
      <TextInput
        label="Help"
        value=""
        onChange={() => {}}
        labelTooltip="Helpful info"
      />,
    );
    // Info icon should be present
    expect(document.querySelector('svg')).toBeInTheDocument();
  });

  it('does not render tooltip icon when labelTooltip is not provided', () => {
    render(<TextInput label="Name" value="" onChange={() => {}} />);
    expect(document.querySelector('svg')).not.toBeInTheDocument();
  });

  describe('hasAutoFocus prop', () => {
    it('focuses the input when hasAutoFocus is true', () => {
      render(
        <TextInput label="Name" value="" onChange={() => {}} hasAutoFocus />,
      );
      expect(screen.getByRole('textbox')).toHaveFocus();
    });

    it('does not focus when hasAutoFocus is false', () => {
      render(<TextInput label="Name" value="" onChange={() => {}} />);
      expect(screen.getByRole('textbox')).not.toHaveFocus();
    });
  });

  describe('htmlName prop', () => {
    it('sets name attribute when htmlName is provided', () => {
      render(
        <TextInput
          label="Name"
          value=""
          onChange={() => {}}
          htmlName="username"
        />,
      );
      expect(screen.getByRole('textbox')).toHaveAttribute('name', 'username');
    });

    it('does not set name attribute when htmlName is not provided', () => {
      render(<TextInput label="Name" value="" onChange={() => {}} />);
      expect(screen.getByRole('textbox')).not.toHaveAttribute('name');
    });
  });

  describe('form participation', () => {
    it('submits the value under htmlName', () => {
      const {container} = render(
        <form>
          <TextInput
            label="Owner"
            htmlName="owner"
            value="alice"
            onChange={() => {}}
          />
        </form>,
      );
      const data = new FormData(container.querySelector('form')!);
      expect(data.get('owner')).toBe('alice');
    });

    it('is excluded from form data when disabled', () => {
      const {container} = render(
        <form>
          <TextInput
            label="Owner"
            htmlName="owner"
            value="alice"
            onChange={() => {}}
            isDisabled
          />
        </form>,
      );
      expect([
        ...new FormData(container.querySelector('form')!).keys(),
      ]).toEqual([]);
    });

    // Regression: a disabledMessage swaps the native `disabled` attribute for
    // aria-disabled + readOnly so the reason stays focus-discoverable, but
    // read-only fields still submit — the name has to be withheld too.
    it('is excluded from form data when disabled, even with a disabledMessage', () => {
      const {container} = render(
        <form>
          <TextInput
            label="Owner"
            htmlName="owner"
            value="alice"
            onChange={() => {}}
            isDisabled
            disabledMessage="You need the Editor role to change this"
          />
        </form>,
      );
      expect([
        ...new FormData(container.querySelector('form')!).keys(),
      ]).toEqual([]);
    });
  });

  describe('isReadOnly', () => {
    it('marks the input read-only', () => {
      render(
        <TextInput
          label="Owner"
          value="alice"
          onChange={() => {}}
          isReadOnly
        />,
      );
      expect(screen.getByRole('textbox')).toHaveAttribute('readonly');
    });

    it('still submits its value with the form', () => {
      const {container} = render(
        <form>
          <TextInput
            label="Owner"
            htmlName="owner"
            value="alice"
            onChange={() => {}}
            isReadOnly
          />
        </form>,
      );
      expect(new FormData(container.querySelector('form')!).get('owner')).toBe(
        'alice',
      );
    });

    it('does not call onChange when the user types', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      render(
        <TextInput
          label="Owner"
          value="alice"
          onChange={handleChange}
          isReadOnly
        />,
      );
      await user.type(screen.getByRole('textbox'), 'xyz');
      expect(handleChange).not.toHaveBeenCalled();
    });

    it('stays focusable and is not disabled', async () => {
      const user = userEvent.setup();
      render(
        <TextInput
          label="Owner"
          value="alice"
          onChange={() => {}}
          isReadOnly
        />,
      );
      const input = screen.getByRole('textbox');
      expect(input).not.toBeDisabled();
      await user.tab();
      expect(input).toHaveFocus();
    });

    it('hides the clear button', () => {
      render(
        <TextInput
          label="Owner"
          value="alice"
          onChange={() => {}}
          hasClear
          isReadOnly
        />,
      );
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('lets isDisabled win when both are set', () => {
      const {container} = render(
        <form>
          <TextInput
            label="Owner"
            htmlName="owner"
            value="alice"
            onChange={() => {}}
            isReadOnly
            isDisabled
          />
        </form>,
      );
      expect(screen.getByRole('textbox')).toHaveAttribute(
        'aria-disabled',
        'true',
      );
      expect([
        ...new FormData(container.querySelector('form')!).keys(),
      ]).toEqual([]);
    });
  });

  describe('autoComplete prop (#5638)', () => {
    it('forwards autoComplete to the native input unchanged', () => {
      render(
        <TextInput
          label="Reason"
          value=""
          onChange={() => {}}
          autoComplete="off"
        />,
      );
      expect(screen.getByRole('textbox')).toHaveAttribute(
        'autocomplete',
        'off',
      );
    });

    it('does not set autocomplete when not provided', () => {
      render(<TextInput label="Name" value="" onChange={() => {}} />);
      expect(screen.getByRole('textbox')).not.toHaveAttribute('autocomplete');
    });
  });

  describe('onEnter', () => {
    it('calls onEnter when Enter key is pressed', async () => {
      const user = userEvent.setup();
      const handleEnter = vi.fn();
      render(
        <TextInput
          label="Name"
          value="hello"
          onChange={() => {}}
          onEnter={handleEnter}
        />,
      );
      const input = screen.getByRole('textbox');
      await user.click(input);
      await user.keyboard('{Enter}');
      expect(handleEnter).toHaveBeenCalledTimes(1);
    });

    it('does not call onEnter when Enter commits an IME conversion', () => {
      // The browser fires this composing keydown for the Enter that commits an
      // IME candidate (isComposing: true, or the legacy keyCode 229) before
      // compositionend writes the conversion. It must NOT trigger onEnter —
      // submit/save actions would fire before the user intends to submit.
      // See utils/ime.ts and #6082.
      const handleEnter = vi.fn();
      const {container} = render(
        <TextInput
          label="Name"
          value="にほんご"
          onChange={() => {}}
          onEnter={handleEnter}
        />,
      );
      const input = container.querySelector('input')!;
      fireEvent.keyDown(input, {key: 'Enter', isComposing: true});
      expect(handleEnter).not.toHaveBeenCalled();
      fireEvent.keyDown(input, {key: 'Enter', keyCode: 229});
      expect(handleEnter).not.toHaveBeenCalled();

      // A real, non-composing Enter after composition ends still submits.
      fireEvent.keyDown(input, {key: 'Enter'});
      expect(handleEnter).toHaveBeenCalledTimes(1);
    });

    it('still calls onKeyDown for composing keydowns', () => {
      // onKeyDown is the raw escape hatch: it keeps receiving IME keydowns so
      // consumers with custom composition handling are unaffected by the
      // onEnter guard.
      const handleKeyDown = vi.fn();
      const {container} = render(
        <TextInput
          label="Name"
          value="にほんご"
          onChange={() => {}}
          onKeyDown={handleKeyDown}
          onEnter={() => {}}
        />,
      );
      const input = container.querySelector('input')!;
      fireEvent.keyDown(input, {key: 'Enter', isComposing: true});
      expect(handleKeyDown).toHaveBeenCalledTimes(1);
    });

    it('does not call onEnter for other keys', async () => {
      const user = userEvent.setup();
      const handleEnter = vi.fn();
      render(
        <TextInput
          label="Name"
          value=""
          onChange={() => {}}
          onEnter={handleEnter}
        />,
      );
      const input = screen.getByRole('textbox');
      await user.click(input);
      await user.keyboard('abc');
      expect(handleEnter).not.toHaveBeenCalled();
    });
  });

  describe('onKeyDown', () => {
    it('passes through onKeyDown events', async () => {
      const user = userEvent.setup();
      const handleKeyDown = vi.fn();
      render(
        <TextInput
          label="Name"
          value=""
          onChange={() => {}}
          onKeyDown={handleKeyDown}
        />,
      );
      const input = screen.getByRole('textbox');
      await user.click(input);
      await user.keyboard('a');
      expect(handleKeyDown).toHaveBeenCalledTimes(1);
    });

    it('calls both onKeyDown and onEnter on Enter', async () => {
      const user = userEvent.setup();
      const handleKeyDown = vi.fn();
      const handleEnter = vi.fn();
      render(
        <TextInput
          label="Name"
          value=""
          onChange={() => {}}
          onKeyDown={handleKeyDown}
          onEnter={handleEnter}
        />,
      );
      const input = screen.getByRole('textbox');
      await user.click(input);
      await user.keyboard('{Enter}');
      expect(handleEnter).toHaveBeenCalledTimes(1);
      expect(handleKeyDown).toHaveBeenCalledTimes(1);
    });
  });

  describe('hasClear', () => {
    it('shows clear button when hasClear is true and value is non-empty', () => {
      render(
        <TextInput label="Name" value="hello" onChange={() => {}} hasClear />,
      );
      expect(
        screen.getByRole('button', {name: 'Clear Name'}),
      ).toBeInTheDocument();
    });

    it('does not show clear button when value is empty', () => {
      render(<TextInput label="Name" value="" onChange={() => {}} hasClear />);
      expect(
        screen.queryByRole('button', {name: 'Clear Name'}),
      ).not.toBeInTheDocument();
    });

    it('does not show clear button when hasClear is false', () => {
      render(<TextInput label="Name" value="hello" onChange={() => {}} />);
      expect(
        screen.queryByRole('button', {name: 'Clear Name'}),
      ).not.toBeInTheDocument();
    });

    it('does not show clear button when disabled', () => {
      render(
        <TextInput
          label="Name"
          value="hello"
          onChange={() => {}}
          hasClear
          isDisabled
        />,
      );
      expect(
        screen.queryByRole('button', {name: 'Clear Name'}),
      ).not.toBeInTheDocument();
    });

    it('calls onChange with empty string when clear is clicked', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <TextInput label="Name" value="hello" onChange={onChange} hasClear />,
      );
      await user.click(screen.getByRole('button', {name: 'Clear Name'}));
      expect(onChange).toHaveBeenCalledWith('', null);
    });
  });

  describe('click-to-focus', () => {
    it('focuses input when clicking the start icon', () => {
      render(
        <TextInput
          label="Search"
          value=""
          onChange={() => {}}
          startIcon={<TestIcon />}
        />,
      );

      const input = screen.getByRole('textbox');
      const wrapper = input.parentElement!;
      // The icon is rendered before the input; grab the first non-input child
      const iconElement = wrapper.querySelector('svg')!;

      fireEvent.click(iconElement);
      expect(input).toHaveFocus();
    });

    it('focuses input when clicking the wrapper padding', () => {
      render(<TextInput label="Name" value="" onChange={() => {}} />);

      const input = screen.getByRole('textbox');
      const wrapper = input.parentElement!;

      fireEvent.click(wrapper);
      expect(input).toHaveFocus();
    });
  });

  describe('width prop (#2755)', () => {
    it('sizes the outer field, not just the input wrapper', () => {
      render(
        <TextInput label="Name" value="" onChange={() => {}} width="100%" />,
      );
      const input = screen.getByRole('textbox');
      const inputWrapper = input.parentElement!;
      // Field root is the labelled ancestor that owns the width.
      const fieldRoot = input.closest('.astryx-field') as HTMLElement;
      expect(fieldRoot).toBeTruthy();
      expect(fieldRoot.getAttribute('style')).toContain('100%');
      // The inner control wrapper is not the element carrying the width.
      expect(fieldRoot).not.toBe(inputWrapper);
      expect(inputWrapper.getAttribute('style') ?? '').not.toContain('100%');
    });

    it('does not set width when the prop is omitted', () => {
      render(<TextInput label="Name" value="" onChange={() => {}} />);
      const fieldRoot = screen
        .getByRole('textbox')
        .closest('.astryx-field') as HTMLElement;
      expect(fieldRoot.getAttribute('style') ?? '').not.toContain('100%');
    });
  });

  describe('disabledMessage', () => {
    it('shows the reason tooltip on hover when disabled with a reason', async () => {
      render(
        <TextInput
          label="Owner"
          value=""
          onChange={() => {}}
          isDisabled
          disabledMessage="You need the Editor role"
        />,
      );

      const input = screen.getByRole('textbox');
      const container = input.parentElement as HTMLElement;
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
        <TextInput
          label="Owner"
          value=""
          onChange={() => {}}
          isDisabled
          disabledMessage="You need the Editor role"
        />,
      );

      const tooltip = screen.getByRole('tooltip', h);
      await user.tab();
      expect(screen.getByRole('textbox')).toHaveFocus();
      await waitFor(() => {
        expect(tooltip).toHaveAttribute('popover-open');
      });
    });

    it('does not render a tooltip when not disabled', () => {
      render(
        <TextInput
          label="Owner"
          value=""
          onChange={() => {}}
          disabledMessage="You need the Editor role"
        />,
      );
      expect(screen.queryByRole('tooltip', h)).not.toBeInTheDocument();
    });

    it('does not render a tooltip when disabled without a reason', () => {
      render(
        <TextInput label="Owner" value="" onChange={() => {}} isDisabled />,
      );
      expect(screen.queryByRole('tooltip', h)).not.toBeInTheDocument();
    });

    it('keeps the input focusable via aria-disabled when a reason is provided', () => {
      render(
        <TextInput
          label="Owner"
          value=""
          onChange={() => {}}
          isDisabled
          disabledMessage="You need the Editor role"
        />,
      );
      const input = screen.getByRole('textbox');
      expect(input).not.toBeDisabled();
      expect(input).toHaveAttribute('aria-disabled', 'true');
      expect(input).toHaveAttribute('readonly');
    });

    it('links the reason tooltip from the input via aria-describedby', () => {
      render(
        <TextInput
          label="Owner"
          value=""
          onChange={() => {}}
          isDisabled
          disabledMessage="You need the Editor role"
        />,
      );
      const input = screen.getByRole('textbox');
      const tooltip = screen.getByRole('tooltip', h);
      expect(input.getAttribute('aria-describedby')).toContain(tooltip.id);
    });

    it('blocks value changes while focusable-disabled', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <TextInput
          label="Owner"
          value=""
          onChange={onChange}
          isDisabled
          disabledMessage="You need the Editor role"
        />,
      );

      const input = screen.getByRole('textbox');
      await user.click(input);
      await user.keyboard('hello');
      expect(onChange).not.toHaveBeenCalled();
      expect(input).toHaveValue('');
    });

    it('stays focusable when disabled without a reason', () => {
      render(
        <TextInput label="Owner" value="" onChange={() => {}} isDisabled />,
      );
      const input = screen.getByRole('textbox');
      expect(input).not.toBeDisabled();
      expect(input).toHaveAttribute('aria-disabled', 'true');
    });
  });
});

describe('TextInput statusVariant forwarding', () => {
  it('defaults to attached (status renders with data-variant="attached")', () => {
    const {container} = render(
      <TextInput
        label="Email"
        value=""
        onChange={() => {}}
        status={{type: 'error', message: 'Invalid email'}}
      />,
    );
    expect(container.querySelector('.astryx-field-status')).toHaveAttribute(
      'data-variant',
      'attached',
    );
  });

  it('forwards statusVariant="detached" to the underlying Field status', () => {
    const {container} = render(
      <TextInput
        label="Email"
        value=""
        onChange={() => {}}
        status={{type: 'error', message: 'Invalid email'}}
        statusVariant="detached"
      />,
    );
    expect(container.querySelector('.astryx-field-status')).toHaveAttribute(
      'data-variant',
      'detached',
    );
  });

  it('renders no message box for statusVariant="tooltip"', () => {
    const {container} = render(
      <TextInput
        label="Email"
        value=""
        onChange={() => {}}
        status={{type: 'error', message: 'Invalid email'}}
        statusVariant="tooltip"
      />,
    );
    expect(
      container.querySelector('.astryx-field-status'),
    ).not.toBeInTheDocument();
  });

  it('surfaces the status message in a tooltip for statusVariant="tooltip"', () => {
    render(
      <TextInput
        label="Email"
        value=""
        onChange={() => {}}
        status={{type: 'error', message: 'Invalid email'}}
        statusVariant="tooltip"
      />,
    );
    const tooltip = screen.getByRole('tooltip', h);
    expect(tooltip).toHaveTextContent('Invalid email');
  });

  it('describes the input by the status tooltip for statusVariant="tooltip"', () => {
    render(
      <TextInput
        label="Email"
        value=""
        onChange={() => {}}
        status={{type: 'error', message: 'Invalid email'}}
        statusVariant="tooltip"
      />,
    );
    const input = screen.getByRole('textbox');
    const tooltip = screen.getByRole('tooltip', h);
    expect(input.getAttribute('aria-describedby')).toContain(tooltip.id);
  });

  it('renders the tooltip status affordance as a focusable button (WCAG 2.1.1)', () => {
    render(
      <TextInput
        label="Email"
        value=""
        onChange={() => {}}
        status={{type: 'error', message: 'Invalid email'}}
        statusVariant="tooltip"
      />,
    );
    // The status affordance is a real button with an accessible name naming
    // the status type (WCAG 4.1.2), so keyboard-only users (no AT) can reach it.
    const statusButton = screen.getByRole('button', {name: /error details/i});
    expect(statusButton).toBeInTheDocument();
    expect(statusButton).toHaveAttribute('type', 'button');
  });

  it('opens the status tooltip on keyboard focus for statusVariant="tooltip"', async () => {
    const user = userEvent.setup();
    render(
      <TextInput
        label="Email"
        value=""
        onChange={() => {}}
        status={{type: 'error', message: 'Invalid email'}}
        statusVariant="tooltip"
      />,
    );
    const tooltip = screen.getByRole('tooltip', h);
    // Tab from the input to the status button; keyboard focus reveals the tip.
    await user.tab();
    await user.tab();
    await waitFor(() => {
      expect(tooltip).toHaveAttribute('popover-open');
    });
  });

  it('describes the status button by the tooltip content for statusVariant="tooltip"', () => {
    render(
      <TextInput
        label="Email"
        value=""
        onChange={() => {}}
        status={{type: 'error', message: 'Invalid email'}}
        statusVariant="tooltip"
      />,
    );
    const statusButton = screen.getByRole('button', {name: /error details/i});
    const tooltip = screen.getByRole('tooltip', h);
    expect(statusButton.getAttribute('aria-describedby')).toContain(tooltip.id);
  });
});

describe('TextInput disabled theme state', () => {
  // Reflecting isDisabled on the root theming target lets a theme gate its own
  // hover/border treatment on disabled (data-disabled + a .disabled variant),
  // mirroring how status is reflected — without structural :has() CSS.
  it('reflects disabled on the root target so themes can gate paint on it', () => {
    const {container} = render(
      <TextInput label="Name" value="" onChange={() => {}} isDisabled />,
    );
    const root = container.querySelector('.astryx-text-input');
    expect(root).toHaveAttribute('data-disabled', 'disabled');
  });

  it('omits data-disabled when enabled, like status does', () => {
    const {container} = render(
      <TextInput label="Name" value="" onChange={() => {}} />,
    );
    const root = container.querySelector('.astryx-text-input');
    expect(root).not.toHaveAttribute('data-disabled');
  });
});

describe('TextInput readonly theme state', () => {
  it('reflects readonly on the root target so themes can gate paint on it', () => {
    const {container} = render(
      <TextInput label="Name" value="" onChange={() => {}} isReadOnly />,
    );
    const root = container.querySelector('.astryx-text-input');
    expect(root).toHaveAttribute('data-readonly', 'readonly');
  });

  it('omits data-readonly when editable', () => {
    const {container} = render(
      <TextInput label="Name" value="" onChange={() => {}} />,
    );
    const root = container.querySelector('.astryx-text-input');
    expect(root).not.toHaveAttribute('data-readonly');
  });
});

describe('TextInput clear button focus behavior', () => {
  it('synchronously restores focus to the input on keyboard activation (detail === 0)', () => {
    const handleChange = vi.fn();
    render(
      <TextInput
        label="Search"
        value="test"
        hasClear
        onChange={handleChange}
      />,
    );

    const input = screen.getByRole('textbox');
    const clearButton = screen.getByRole('button', {name: /clear/i});

    clearButton.focus();
    expect(document.activeElement).toBe(clearButton);

    // Keyboard activation (e.g. Enter / Space on focused button yields detail 0)
    fireEvent.click(clearButton, {detail: 0});

    expect(handleChange).toHaveBeenCalledWith('', expect.any(Object));
    // Must be synchronously focused without waiting for animation frames
    expect(document.activeElement).toBe(input);
  });

  it('focuses the input inside the tap on pointer activation, without scrolling', () => {
    // iOS Safari brings up its keyboard only for a focus made while handling
    // the touch: a deferred focus would leave an unfocused field focused but
    // keyboardless.
    const handleChange = vi.fn();
    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus');
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame');
    render(
      <TextInput
        label="Search"
        value="test"
        hasClear
        onChange={handleChange}
      />,
    );
    const input = screen.getByRole('textbox');
    const clearButton = screen.getByRole('button', {name: /clear/i});
    expect(document.activeElement).not.toBe(input);

    fireEvent.click(clearButton, {detail: 1});

    expect(handleChange).toHaveBeenCalledWith('', expect.any(Object));
    expect(document.activeElement).toBe(input);
    expect(focusSpy).toHaveBeenLastCalledWith({preventScroll: true});
    expect(rafSpy).not.toHaveBeenCalled();
    focusSpy.mockRestore();
    rafSpy.mockRestore();
  });
});

describe('TextInput text size', () => {
  it('renders the theme body size outside the iOS zoom gate', () => {
    // The 16px floor rides `@supports (-webkit-touch-callout: none)` inside
    // `@media (pointer: coarse)` — iOS Safari is the browser that zooms on
    // focus under 16px, so the floor targets it alone instead of every
    // coarse pointer. jsdom's CSSOM drops at-rule-wrapped declarations it
    // cannot parse, so the gate itself is pinned against the sources in
    // inputFontFloor.test.ts; what this asserts is the visible result off
    // the gate: the plain token size, not a floor.
    render(<TextInput label="Name" value="" onChange={() => {}} />);
    expect(declaredValue(screen.getByLabelText('Name'), 'font-size')).toBe(
      'var(--text-body-size)',
    );
  });
});

describe('TextInput in a narrow row', () => {
  it('lets a filter bar shrink the whole field instead of overflowing', () => {
    const {container} = render(
      <TextInput label="Search" value="" onChange={() => {}} />,
    );
    const root = container.querySelector('.astryx-field')!;
    expect(getComputedStyle(root).minWidth).toBe('0');
  });
});
