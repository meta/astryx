// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file NumberInput.test.tsx
 * @input Uses vitest, @testing-library/react, NumberInput component
 * @output Unit tests for NumberInput component behavior
 * @position Testing; validates NumberInput.tsx implementation
 *
 * SYNC: When NumberInput.tsx changes, update tests to match new behavior
 */

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {act, useState} from 'react';
import {render, screen, fireEvent, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as stylex from '@stylexjs/stylex';
import {colorVars} from '../theme/tokens.stylex';
import {TestIcon} from '../__tests__/TestIcon';
import {InternationalizationProvider} from '../i18n';
import {registerIcons, resetIcons} from '../Icon';
import {InputGroup} from '../InputGroup';
import {NumberInput} from './NumberInput';
import {defineTheme} from '../theme/defineTheme';
import {generateThemeCSS} from '../theme/generateThemeRules';
import {__resetLiveRegionsForTest} from '../hooks/useAnnounce';

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

// FieldStatus announces status messages through the persistent useAnnounce
// singletons; remove them between tests so role/aria-live queries in this
// file never match a leftover region.
afterEach(() => {
  __resetLiveRegionsForTest();
  resetIcons();
});

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

describe('NumberInput', () => {
  it('renders with label', () => {
    render(<NumberInput label="Quantity" value={null} onChange={() => {}} />);
    expect(screen.getByLabelText('Quantity')).toBeInTheDocument();
  });

  it('renders with placeholder', () => {
    render(
      <NumberInput
        label="Quantity"
        value={null}
        onChange={() => {}}
        placeholder="Enter number"
      />,
    );
    expect(screen.getByPlaceholderText('Enter number')).toBeInTheDocument();
  });

  it('displays the controlled value as editable text', () => {
    render(<NumberInput label="Quantity" value={456} onChange={() => {}} />);
    expect(screen.getByRole('spinbutton')).toHaveValue('456');
  });

  it('displays an empty string for a null value', () => {
    render(<NumberInput label="Quantity" value={null} onChange={() => {}} />);
    expect(screen.getByRole('spinbutton')).toHaveValue('');
  });

  it('displays an empty string for an undefined value', () => {
    render(
      <NumberInput label="Quantity" value={undefined} onChange={() => {}} />,
    );
    expect(screen.getByRole('spinbutton')).toHaveValue('');
  });

  it('forwards ref correctly', () => {
    const ref = vi.fn();
    render(
      <NumberInput
        ref={ref}
        label="Quantity"
        value={null}
        onChange={() => {}}
      />,
    );
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLInputElement));
  });

  it('visually hides label when isLabelHidden is true', () => {
    render(
      <NumberInput
        label="Quantity"
        isLabelHidden
        value={null}
        onChange={() => {}}
      />,
    );
    const label = screen.getByText('Quantity');
    expect(label).toBeInTheDocument();
    expect(screen.getByLabelText('Quantity')).toBeInTheDocument();
  });

  it('shows label visually by default', () => {
    render(<NumberInput label="Amount" value={null} onChange={() => {}} />);
    const label = screen.getByText('Amount');
    expect(label).toBeVisible();
  });

  it('sets aria-required when isRequired is true', () => {
    render(
      <NumberInput
        label="Quantity"
        isRequired
        value={null}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole('spinbutton')).toHaveAttribute(
      'aria-required',
      'true',
    );
  });

  it('does not set aria-required when isRequired is false', () => {
    render(<NumberInput label="Quantity" value={null} onChange={() => {}} />);
    expect(screen.getByRole('spinbutton')).not.toHaveAttribute('aria-required');
  });

  it('exposes aria-disabled, not native disabled, when isDisabled is true (spec:AST-085)', () => {
    render(
      <NumberInput
        label="Quantity"
        isDisabled
        value={null}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole('spinbutton')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('keeps a disabled input in the tab order and rings it (spec:AST-085 FR1, FR6)', async () => {
    const user = userEvent.setup();
    render(
      <>
        <NumberInput label="First" value={1} onChange={() => {}} />
        <NumberInput label="Second" value={2} onChange={() => {}} isDisabled />
      </>,
    );
    await user.tab();
    await user.tab();
    const input = screen.getByRole('spinbutton', {name: 'Second'});
    expect(input).toHaveFocus();
    expect(input.parentElement).toHaveClass(RING);
  });

  it('runs no caller handler, steps nothing and submits no form while disabled (spec:AST-085 FR2)', async () => {
    const user = userEvent.setup();
    const handlers = {
      onChange: vi.fn(),
      onEnter: vi.fn(),
      onKeyDown: vi.fn(),
      onPaste: vi.fn(),
    };
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <NumberInput
          label="Quantity"
          value={5}
          isDisabled
          hasNumberSteppers
          {...handlers}
        />
      </form>,
    );
    await user.click(screen.getByRole('spinbutton'));
    await user.keyboard('{ArrowUp}{ArrowDown}{Enter}');
    await user.paste('9');
    await user.click(screen.getByRole('button', {name: 'Increment Quantity'}));
    for (const handler of [...Object.values(handlers), onSubmit]) {
      expect(handler).not.toHaveBeenCalled();
    }
  });

  it('commits nothing when a field disabled mid-entry loses focus (spec:AST-085 FR2)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const field = (isDisabled: boolean) => (
      <NumberInput
        label="Quantity"
        value={5}
        onChange={onChange}
        isDisabled={isDisabled}
      />
    );
    const {rerender} = render(field(false));
    const input = screen.getByRole('spinbutton');
    await user.clear(input);
    await user.type(input, '8');
    onChange.mockClear();
    rerender(field(true));
    await user.tab();
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue('5');
  });

  it('does not fire onChange when disabled', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <NumberInput
        label="Quantity"
        isDisabled
        value={null}
        onChange={handleChange}
      />,
    );

    const input = screen.getByRole('spinbutton');
    await user.type(input, '123');
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('is not disabled by default', () => {
    render(<NumberInput label="Quantity" value={null} onChange={() => {}} />);
    expect(screen.getByRole('spinbutton')).not.toBeDisabled();
  });

  it('renders with startIcon', () => {
    render(
      <NumberInput
        label="Count"
        value={null}
        onChange={() => {}}
        startIcon={TestIcon}
      />,
    );
    expect(screen.getByRole('spinbutton')).toBeInTheDocument();
    const svg = document.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('renders without icon wrapper when startIcon is not provided', () => {
    const {container} = render(
      <NumberInput label="Quantity" value={null} onChange={() => {}} />,
    );
    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });

  describe('text-backed spinbutton attributes', () => {
    it('uses a text input with decimal input mode by default', () => {
      render(<NumberInput label="Price" value={5} onChange={() => {}} />);
      const input = screen.getByRole('spinbutton');
      expect(input).toHaveAttribute('type', 'text');
      expect(input).toHaveAttribute('inputmode', 'decimal');
    });

    it('uses numeric input mode for integer-only values', () => {
      render(
        <NumberInput
          label="Count"
          value={5}
          onChange={() => {}}
          isIntegerOnly
        />,
      );
      expect(screen.getByRole('spinbutton')).toHaveAttribute(
        'inputmode',
        'numeric',
      );
    });

    it('exposes the minimum through spinbutton ARIA', () => {
      render(
        <NumberInput label="Age" value={null} onChange={() => {}} min={0} />,
      );
      expect(screen.getByRole('spinbutton')).toHaveAttribute(
        'aria-valuemin',
        '0',
      );
    });

    it('exposes the maximum through spinbutton ARIA', () => {
      render(
        <NumberInput label="Age" value={null} onChange={() => {}} max={120} />,
      );
      expect(screen.getByRole('spinbutton')).toHaveAttribute(
        'aria-valuemax',
        '120',
      );
    });

    it('exposes the current value through spinbutton ARIA', () => {
      render(<NumberInput label="Age" value={42} onChange={() => {}} />);
      expect(screen.getByRole('spinbutton')).toHaveAttribute(
        'aria-valuenow',
        '42',
      );
    });
  });

  describe('formatted display values', () => {
    it('shows the formatted value at rest and exposes it to assistive technology', () => {
      render(
        <NumberInput
          label="Revenue"
          value={1234}
          onChange={() => {}}
          formatValue={number => `$${number.toLocaleString('en-US')}`}
        />,
      );
      const input = screen.getByRole('spinbutton');
      expect(input).toHaveValue('$1,234');
      expect(input).toHaveAttribute('aria-valuetext', '$1,234');
      expect(input).toHaveAttribute('aria-valuenow', '1234');
    });

    it('keeps ARIA value text on the committed value while an edit is pending', () => {
      function ControlledNumberInput() {
        const [controlledValue, setControlledValue] = useState(1234);
        return (
          <NumberInput
            label="Revenue"
            value={controlledValue}
            onChange={setControlledValue}
            formatValue={number => `$${number.toLocaleString('en-US')}`}
          />
        );
      }
      render(<ControlledNumberInput />);
      const input = screen.getByRole('spinbutton');
      fireEvent.focus(input);
      fireEvent.input(input, {target: {value: '4200'}});

      expect(input).toHaveAttribute('aria-valuenow', '1234');
      expect(input).toHaveAttribute('aria-valuetext', '$1,234');

      fireEvent.blur(input);
      expect(input).toHaveAttribute('aria-valuenow', '4200');
      expect(input).toHaveAttribute('aria-valuetext', '$4,200');
    });

    it('shows the raw numeric value while focused and restores formatting on blur', () => {
      render(
        <NumberInput
          label="Revenue"
          value={1234}
          onChange={() => {}}
          formatValue={number => `$${number.toLocaleString('en-US')}`}
        />,
      );
      const input = screen.getByRole('spinbutton');

      fireEvent.focus(input);
      expect(input).toHaveValue('1234');

      fireEvent.blur(input);
      expect(input).toHaveValue('$1,234');
    });

    it('preserves invalid pending text while focused, then restores the formatted true value', () => {
      const onChange = vi.fn();
      render(
        <NumberInput
          label="Quantity"
          value={3}
          onChange={onChange}
          isIntegerOnly
          formatValue={number => `${number} items`}
        />,
      );
      const input = screen.getByRole('spinbutton');

      fireEvent.focus(input);
      fireEvent.change(input, {target: {value: '3.5'}});
      expect(input).toHaveValue('3.5');
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(onChange).not.toHaveBeenCalledWith(3.5);

      fireEvent.blur(input);
      expect(input).toHaveValue('3 items');
    });

    it('does not call the formatter for an empty value', () => {
      const formatValue = vi.fn((number: number) => String(number));
      render(
        <NumberInput
          label="Quantity"
          value={null}
          onChange={() => {}}
          formatValue={formatValue}
        />,
      );
      expect(screen.getByRole('spinbutton')).toHaveValue('');
      expect(formatValue).not.toHaveBeenCalled();
    });
  });

  describe('onChange validation', () => {
    it('commits a valid number on blur', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      render(
        <NumberInput label="Quantity" value={null} onChange={handleChange} />,
      );

      const input = screen.getByRole('spinbutton');
      await user.click(input);
      await user.type(input, '42');
      expect(handleChange).not.toHaveBeenCalled();

      await user.tab();
      expect(handleChange).toHaveBeenCalledTimes(1);
      expect(handleChange).toHaveBeenCalledWith(42);
    });

    it('does not call onChange when value exceeds max', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      render(
        <NumberInput
          label="Rating"
          value={null}
          onChange={handleChange}
          max={5}
        />,
      );

      const input = screen.getByRole('spinbutton');
      await user.click(input);
      await user.type(input, '10');

      expect(handleChange).not.toHaveBeenCalled();
    });

    it('does not call onChange when value is below min', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      render(
        <NumberInput
          label="Age"
          value={null}
          onChange={handleChange}
          min={0}
        />,
      );

      const input = screen.getByRole('spinbutton');
      await user.click(input);
      await user.type(input, '-5');

      // Neither -5 nor any partial input is valid with min=0
      expect(handleChange).not.toHaveBeenCalled();
    });

    it('does not call onChange for decimal when isIntegerOnly is true', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      render(
        <NumberInput
          label="Count"
          value={null}
          onChange={handleChange}
          isIntegerOnly
        />,
      );

      const input = screen.getByRole('spinbutton');
      await user.click(input);
      await user.type(input, '3.5');

      expect(handleChange).not.toHaveBeenCalled();
    });

    it('calls onChange for decimal when isIntegerOnly is false', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      render(
        <NumberInput label="Price" value={null} onChange={handleChange} />,
      );

      const input = screen.getByRole('spinbutton');
      await user.click(input);
      await user.type(input, '3.5');
      expect(handleChange).not.toHaveBeenCalled();

      await user.tab();
      expect(handleChange).toHaveBeenCalledWith(3.5);
    });
  });

  describe('invalid draft commit policy', () => {
    function ControlledNumberInput({
      initialValue = 7,
      locale = 'en-US',
    }: {
      initialValue?: number | null;
      locale?: 'en-US' | 'de-DE';
    }) {
      const [controlledValue, setControlledValue] = useState<number | null>(
        initialValue,
      );
      return (
        <InternationalizationProvider locale={locale}>
          <NumberInput
            label="Quantity"
            value={controlledValue}
            onChange={setControlledValue}
          />
          <output data-testid="committed">{String(controlledValue)}</output>
        </InternationalizationProvider>
      );
    }

    async function exerciseInvalidDraft(
      entry: 'typing' | 'input',
      commit: 'blur' | 'Enter',
    ) {
      const user = userEvent.setup();
      render(<ControlledNumberInput />);
      const input = screen.getByRole('spinbutton');
      await user.click(input);
      await user.clear(input);
      if (entry === 'typing') {
        await user.type(input, '1·234·567');
      } else {
        fireEvent.input(input, {target: {value: '1·234·567'}});
      }

      expect(input).toHaveValue('1·234·567');
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByTestId('committed')).toHaveTextContent('7');

      if (commit === 'blur') {
        await user.tab();
        expect(input).toHaveValue('7');
        expect(input).not.toHaveAttribute('aria-invalid');
      } else {
        await user.keyboard('{Enter}');
        expect(input).toHaveValue('1·234·567');
        expect(input).toHaveAttribute('aria-invalid', 'true');
      }
      expect(screen.getByTestId('committed')).toHaveTextContent('7');
    }

    it('rejects a sequentially typed invalid draft on blur', async () => {
      await exerciseInvalidDraft('typing', 'blur');
    });

    it('rejects a one-shot invalid draft on blur', async () => {
      await exerciseInvalidDraft('input', 'blur');
    });

    it('rejects a sequentially typed invalid draft on Enter', async () => {
      await exerciseInvalidDraft('typing', 'Enter');
    });

    it('rejects a one-shot invalid draft on Enter', async () => {
      await exerciseInvalidDraft('input', 'Enter');
    });

    it('commits a valid localized grouped number as one edit', async () => {
      const user = userEvent.setup();
      render(<ControlledNumberInput locale="de-DE" />);
      const input = screen.getByRole('spinbutton');
      await user.click(input);
      await user.clear(input);
      await user.type(input, '1.234.567');

      expect(screen.getByTestId('committed')).toHaveTextContent('7');
      await user.tab();
      expect(screen.getByTestId('committed')).toHaveTextContent('1234567');
      expect(input).toHaveValue('1234567');
    });

    it('keeps a controlled update behind an invalid focused draft', () => {
      const onChange = vi.fn();
      const {rerender} = render(
        <NumberInput label="Quantity" value={7} onChange={onChange} />,
      );
      const input = screen.getByRole('spinbutton');
      fireEvent.focus(input);
      fireEvent.input(input, {target: {value: '1·234·567'}});

      rerender(<NumberInput label="Quantity" value={9} onChange={onChange} />);
      expect(input).toHaveValue('1·234·567');
      fireEvent.blur(input);

      expect(onChange).not.toHaveBeenCalled();
      expect(input).toHaveValue('9');
    });

    it('waits for IME composition to finish before committing', () => {
      const onChange = vi.fn();
      render(<NumberInput label="Quantity" value={7} onChange={onChange} />);
      const input = screen.getByRole('spinbutton');
      fireEvent.focus(input);
      fireEvent.input(input, {target: {value: '42'}});
      fireEvent.keyDown(input, {key: 'Enter', isComposing: true});
      expect(onChange).not.toHaveBeenCalled();

      fireEvent.keyDown(input, {key: 'Enter'});
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(42);
    });

    it('steps from the committed value when the draft is invalid', () => {
      const onChange = vi.fn();
      render(<NumberInput label="Quantity" value={7} onChange={onChange} />);
      const input = screen.getByRole('spinbutton');
      fireEvent.focus(input);
      fireEvent.input(input, {target: {value: '1·234·567'}});
      fireEvent.keyDown(input, {key: 'ArrowUp'});

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(8);
      expect(input).toHaveValue('7');
    });
  });

  describe('units prop', () => {
    it('renders units text when provided', () => {
      render(
        <NumberInput
          label="Discount"
          value={10}
          onChange={() => {}}
          units="%"
        />,
      );
      expect(screen.getByText('%')).toBeInTheDocument();
    });

    it('does not render units when not provided', () => {
      render(<NumberInput label="Amount" value={100} onChange={() => {}} />);
      expect(screen.queryByText('%')).not.toBeInTheDocument();
      expect(screen.queryByText('GB')).not.toBeInTheDocument();
    });

    it('includes the units text in the accessible description (WCAG 1.3.1)', () => {
      render(
        <NumberInput
          label="Storage"
          value={50}
          onChange={() => {}}
          units="GB"
        />,
      );
      expect(screen.getByRole('spinbutton')).toHaveAccessibleDescription(/GB/);
    });

    it('combines units with the description in the accessible description', () => {
      render(
        <NumberInput
          label="Discount"
          value={10}
          onChange={() => {}}
          description="Applied at checkout"
          units="%"
        />,
      );
      const input = screen.getByRole('spinbutton');
      expect(input).toHaveAccessibleDescription(/Applied at checkout/);
      expect(input).toHaveAccessibleDescription(/%/);
    });
  });

  describe('event callbacks', () => {
    it('calls onFocus when input receives focus', async () => {
      const user = userEvent.setup();
      const handleFocus = vi.fn();
      render(
        <NumberInput
          label="Quantity"
          value={null}
          onChange={() => {}}
          onFocus={handleFocus}
        />,
      );

      await user.click(screen.getByRole('spinbutton'));
      expect(handleFocus).toHaveBeenCalledTimes(1);
    });

    it('calls onBlur when input loses focus', async () => {
      const user = userEvent.setup();
      const handleBlur = vi.fn();
      render(
        <NumberInput
          label="Quantity"
          value={null}
          onChange={() => {}}
          onBlur={handleBlur}
        />,
      );

      const input = screen.getByRole('spinbutton');
      await user.click(input);
      await user.tab();
      expect(handleBlur).toHaveBeenCalledTimes(1);
    });

    it('calls onEnter when Enter key is pressed', async () => {
      const user = userEvent.setup();
      const handleEnter = vi.fn();
      render(
        <NumberInput
          label="Quantity"
          value={null}
          onChange={() => {}}
          onEnter={handleEnter}
        />,
      );

      const input = screen.getByRole('spinbutton');
      await user.click(input);
      await user.keyboard('{Enter}');
      expect(handleEnter).toHaveBeenCalledTimes(1);
    });

    it('commits valid value on Enter key', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      const handleEnter = vi.fn();
      render(
        <NumberInput
          label="Quantity"
          value={null}
          onChange={handleChange}
          onEnter={handleEnter}
        />,
      );

      const input = screen.getByRole('spinbutton');
      await user.click(input);
      await user.type(input, '42');
      handleChange.mockClear();
      await user.keyboard('{Enter}');

      expect(handleEnter).toHaveBeenCalledTimes(1);
    });
  });

  describe('range clamping on commit', () => {
    it('commits an over-max entry at max on blur', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      render(
        <NumberInput
          label="Page"
          value={null}
          onChange={handleChange}
          min={1}
          max={2}
          isIntegerOnly
        />,
      );

      const input = screen.getByRole('spinbutton');
      await user.click(input);
      await user.type(input, '100');
      handleChange.mockClear();
      await user.tab();

      expect(handleChange).toHaveBeenCalledWith(2);
    });

    it('commits an over-max entry at max on Enter', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      render(
        <NumberInput
          label="Rating"
          value={null}
          onChange={handleChange}
          max={5}
        />,
      );

      const input = screen.getByRole('spinbutton');
      await user.click(input);
      await user.type(input, '10');
      handleChange.mockClear();
      await user.keyboard('{Enter}');

      expect(handleChange).toHaveBeenCalledWith(5);
    });

    it('commits a below-min entry at min', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      render(
        <NumberInput
          label="Age"
          value={null}
          onChange={handleChange}
          min={0}
        />,
      );

      const input = screen.getByRole('spinbutton');
      await user.click(input);
      await user.type(input, '-5');
      await user.tab();

      expect(handleChange).toHaveBeenCalledWith(0);
    });

    it('does not clamp while typing', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      render(
        <NumberInput
          label="Rating"
          value={null}
          onChange={handleChange}
          max={5}
        />,
      );

      const input = screen.getByRole('spinbutton');
      await user.click(input);
      await user.type(input, '10');

      // The entry stays exactly as typed until it is committed.
      expect(input).toHaveValue('10');
      expect(handleChange).not.toHaveBeenCalledWith(5);
    });

    it('displays the clamped value after commit', async () => {
      const user = userEvent.setup();
      function ControlledNumberInput() {
        const [value, setValue] = useState<number>(1);
        return (
          <NumberInput
            label="Page"
            value={value}
            onChange={setValue}
            min={1}
            max={2}
            isIntegerOnly
          />
        );
      }
      render(<ControlledNumberInput />);

      const input = screen.getByRole('spinbutton');
      await user.click(input);
      await user.clear(input);
      await user.type(input, '100');
      await user.tab();

      expect(input).toHaveValue('2');
    });

    it('shows the clamped value in the field after Enter', async () => {
      const user = userEvent.setup();
      function ControlledNumberInput() {
        const [value, setValue] = useState<number | null>(null);
        return (
          <NumberInput
            label="Rating"
            value={value}
            onChange={setValue}
            min={1}
            max={5}
          />
        );
      }
      render(<ControlledNumberInput />);

      const input = screen.getByRole('spinbutton');
      await user.click(input);
      await user.type(input, '10{Enter}');

      // Still focused: the field must not keep showing the rejected entry.
      expect(input).toHaveValue('5');
    });

    it('reverts an entry that is not a usable number', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      render(
        <NumberInput
          label="Count"
          value={null}
          onChange={handleChange}
          max={10}
          isIntegerOnly
        />,
      );

      const input = screen.getByRole('spinbutton');
      await user.click(input);
      await user.type(input, '12.5');
      handleChange.mockClear();
      await user.tab();

      expect(handleChange).not.toHaveBeenCalled();
      expect(input).toHaveValue('');
    });

    it('rounds a fractional max inwards for an integer-only field', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      render(
        <NumberInput
          label="Count"
          value={null}
          onChange={handleChange}
          max={9.5}
          isIntegerOnly
        />,
      );

      const input = screen.getByRole('spinbutton');
      await user.click(input);
      await user.type(input, '20');
      handleChange.mockClear();
      await user.tab();

      expect(handleChange).toHaveBeenCalledWith(9);
    });

    it('rounds a fractional min inwards for an integer-only field', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      render(
        <NumberInput
          label="Count"
          value={null}
          onChange={handleChange}
          min={0.5}
          isIntegerOnly
        />,
      );

      const input = screen.getByRole('spinbutton');
      await user.click(input);
      await user.type(input, '0');
      handleChange.mockClear();
      await user.tab();

      expect(handleChange).toHaveBeenCalledWith(1);
    });

    it('does not clamp when no value can satisfy both bounds', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      render(
        <NumberInput
          label="Count"
          value={null}
          onChange={handleChange}
          min={5}
          max={2}
        />,
      );

      const input = screen.getByRole('spinbutton');
      await user.click(input);
      await user.type(input, '10');
      handleChange.mockClear();
      await user.tab();

      expect(handleChange).not.toHaveBeenCalled();
      expect(input).toHaveValue('');
    });
  });

  describe('status prop', () => {
    it('renders with error status icon', () => {
      const {container} = render(
        <NumberInput
          label="Amount"
          value={null}
          onChange={() => {}}
          status={{type: 'error'}}
        />,
      );
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('renders with warning status icon', () => {
      const {container} = render(
        <NumberInput
          label="Amount"
          value={null}
          onChange={() => {}}
          status={{type: 'warning'}}
        />,
      );
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('renders with success status icon', () => {
      const {container} = render(
        <NumberInput
          label="Amount"
          value={null}
          onChange={() => {}}
          status={{type: 'success'}}
        />,
      );
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('renders status message when provided', () => {
      render(
        <NumberInput
          label="Amount"
          value={null}
          onChange={() => {}}
          status={{type: 'error', message: 'Value must be positive'}}
        />,
      );
      expect(screen.getByText('Value must be positive')).toBeInTheDocument();
    });

    it('has no dangling aria-describedby ids inside InputGroup (WCAG 1.3.1)', () => {
      // Inside an InputGroup no Field renders, so the status message element
      // does not exist; aria-describedby must not reference its id.
      render(
        <InputGroup label="Price">
          <NumberInput
            label="Amount"
            value={null}
            onChange={() => {}}
            status={{type: 'error', message: 'Value must be positive'}}
          />
        </InputGroup>,
      );
      const input = screen.getByRole('spinbutton');
      const describedBy = input.getAttribute('aria-describedby') ?? '';
      for (const idToken of describedBy.split(/\s+/).filter(Boolean)) {
        expect(document.getElementById(idToken)).not.toBeNull();
      }
    });

    it('names the input by its label and a caller aria-labelledby', () => {
      render(
        <>
          <span id="shipping-heading">Shipping</span>
          <NumberInput
            label="Amount"
            value={null}
            onChange={() => {}}
            aria-labelledby="shipping-heading"
          />
        </>,
      );
      const input = screen.getByRole('spinbutton', {name: 'Amount Shipping'});
      expect(input.getAttribute('aria-labelledby')?.split(' ')).toContain(
        'shipping-heading',
      );
    });

    it('names a grouped input by the group, its label, and a caller aria-labelledby', () => {
      render(
        <>
          <span id="shipping-heading">Shipping</span>
          <InputGroup label="Price">
            <NumberInput
              label="Amount"
              value={null}
              onChange={() => {}}
              aria-labelledby="shipping-heading"
            />
          </InputGroup>
        </>,
      );
      expect(
        screen.getByRole('spinbutton', {name: 'Price Amount Shipping'}),
      ).toBeInTheDocument();
    });

    it('leaves a standalone input named by its label element without a caller aria-labelledby', () => {
      render(<NumberInput label="Amount" value={null} onChange={() => {}} />);
      const input = screen.getByRole('spinbutton', {name: 'Amount'});
      expect(input).not.toHaveAttribute('aria-labelledby');
    });

    it('does not render status message when not provided', () => {
      render(
        <NumberInput
          label="Amount"
          value={null}
          onChange={() => {}}
          status={{type: 'error'}}
        />,
      );
      expect(screen.queryByText(/positive/i)).not.toBeInTheDocument();
    });

    it('sets aria-invalid when status type is error', () => {
      render(
        <NumberInput
          label="Amount"
          value={null}
          onChange={() => {}}
          status={{type: 'error'}}
        />,
      );
      expect(screen.getByRole('spinbutton')).toHaveAttribute(
        'aria-invalid',
        'true',
      );
    });

    it('does not set aria-invalid for warning status', () => {
      render(
        <NumberInput
          label="Amount"
          value={null}
          onChange={() => {}}
          status={{type: 'warning'}}
        />,
      );
      expect(screen.getByRole('spinbutton')).not.toHaveAttribute(
        'aria-invalid',
      );
    });

    it('does not set aria-invalid for success status', () => {
      render(
        <NumberInput
          label="Amount"
          value={null}
          onChange={() => {}}
          status={{type: 'success'}}
        />,
      );
      expect(screen.getByRole('spinbutton')).not.toHaveAttribute(
        'aria-invalid',
      );
    });
  });

  describe('invalid typed input feedback (WCAG 3.3.1)', () => {
    it('sets aria-invalid="true" when typed input is unparseable', async () => {
      const user = userEvent.setup();
      render(
        <NumberInput
          label="Count"
          value={null}
          onChange={() => {}}
          isIntegerOnly
        />,
      );

      const input = screen.getByRole('spinbutton');
      await user.click(input);
      // "3.5" is invalid when isIntegerOnly is set
      await user.type(input, '3.5');

      expect(input).toHaveAttribute('aria-invalid', 'true');
    });

    it('does not set aria-invalid when typed input is valid', async () => {
      const user = userEvent.setup();
      render(<NumberInput label="Count" value={null} onChange={() => {}} />);

      const input = screen.getByRole('spinbutton');
      await user.click(input);
      await user.type(input, '42');

      expect(input).not.toHaveAttribute('aria-invalid');
    });

    it('announces an alert message when typed input is invalid', async () => {
      const user = userEvent.setup();
      render(
        <NumberInput
          label="Count"
          value={null}
          onChange={() => {}}
          isIntegerOnly
        />,
      );

      const input = screen.getByRole('spinbutton');
      await user.click(input);
      await user.type(input, '3.5');

      expect(screen.getByRole('alert')).toHaveTextContent('Invalid number');
    });

    it('resolves the invalid-number announcement from the i18n catalog', async () => {
      const user = userEvent.setup();
      render(
        <InternationalizationProvider
          locale="ar-SA"
          overrides={{
            'ar-SA': {'@astryx.numberInput.invalidNumber': 'رقم غير صالح'},
          }}>
          <NumberInput
            label="Count"
            value={null}
            onChange={() => {}}
            isIntegerOnly
          />
        </InternationalizationProvider>,
      );

      const input = screen.getByRole('spinbutton');
      await user.click(input);
      await user.type(input, '3.5');

      expect(screen.getByRole('alert')).toHaveTextContent('رقم غير صالح');
    });

    it('does not announce an alert message when input is valid', async () => {
      const user = userEvent.setup();
      render(<NumberInput label="Count" value={null} onChange={() => {}} />);

      const input = screen.getByRole('spinbutton');
      await user.click(input);
      await user.type(input, '42');

      expect(screen.getByRole('alert')).toHaveTextContent('');
      expect(screen.queryByText('Invalid number')).not.toBeInTheDocument();
    });
  });

  it('renders tooltip info icon when labelTooltip is provided', () => {
    render(
      <NumberInput
        label="Help"
        value={null}
        onChange={() => {}}
        labelTooltip="Helpful info"
      />,
    );
    expect(document.querySelector('svg')).toBeInTheDocument();
  });

  it('does not render tooltip icon when labelTooltip is not provided', () => {
    render(<NumberInput label="Quantity" value={null} onChange={() => {}} />);
    expect(document.querySelector('svg')).not.toBeInTheDocument();
  });

  describe('hasAutoFocus prop', () => {
    it('focuses the input when hasAutoFocus is true', () => {
      render(
        <NumberInput
          label="Quantity"
          value={null}
          onChange={() => {}}
          hasAutoFocus
        />,
      );
      expect(screen.getByRole('spinbutton')).toHaveFocus();
    });

    it('does not focus when hasAutoFocus is false', () => {
      render(<NumberInput label="Quantity" value={null} onChange={() => {}} />);
      expect(screen.getByRole('spinbutton')).not.toHaveFocus();
    });
  });

  describe('htmlName prop', () => {
    it('sets name attribute when htmlName is provided', () => {
      render(
        <NumberInput
          label="Quantity"
          value={null}
          onChange={() => {}}
          htmlName="quantity"
        />,
      );
      expect(screen.getByRole('spinbutton')).toHaveAttribute(
        'name',
        'quantity',
      );
    });

    it('does not set name attribute when htmlName is not provided', () => {
      render(<NumberInput label="Quantity" value={null} onChange={() => {}} />);
      expect(screen.getByRole('spinbutton')).not.toHaveAttribute('name');
    });
  });

  describe('form participation', () => {
    it('submits the value under htmlName', () => {
      const {container} = render(
        <form>
          <NumberInput
            label="Quantity"
            htmlName="quantity"
            value={42}
            onChange={() => {}}
          />
        </form>,
      );
      const data = new FormData(container.querySelector('form')!);
      expect(data.get('quantity')).toBe('42');
    });

    it('submits the raw number instead of the formatted display value', () => {
      const {container} = render(
        <form>
          <NumberInput
            label="Revenue"
            htmlName="revenue"
            value={1234}
            onChange={() => {}}
            formatValue={number => `$${number.toLocaleString('en-US')}`}
          />
        </form>,
      );
      const data = new FormData(container.querySelector('form')!);
      expect(data.get('revenue')).toBe('1234');
    });

    it('submits the committed value in formatted mode until an edit commits', () => {
      function ControlledForm() {
        const [controlledValue, setControlledValue] = useState(7);
        return (
          <form>
            <NumberInput
              label="Quantity"
              htmlName="quantity"
              value={controlledValue}
              onChange={setControlledValue}
              formatValue={String}
            />
          </form>
        );
      }
      const {container} = render(<ControlledForm />);
      const form = container.querySelector('form')!;
      const input = screen.getByRole('spinbutton');
      fireEvent.focus(input);
      fireEvent.input(input, {target: {value: '42'}});

      expect(new FormData(form).get('quantity')).toBe('7');
      fireEvent.blur(input);
      expect(new FormData(form).get('quantity')).toBe('42');
    });

    it('is excluded from form data when disabled', () => {
      const {container} = render(
        <form>
          <NumberInput
            label="Quantity"
            htmlName="quantity"
            value={42}
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
          <NumberInput
            label="Quantity"
            htmlName="quantity"
            value={42}
            onChange={() => {}}
            isDisabled
            disabledMessage="Quantity is fixed by the contract"
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
        <NumberInput
          label="Quantity"
          value={42}
          onChange={() => {}}
          isReadOnly
        />,
      );
      expect(screen.getByRole('spinbutton')).toHaveAttribute('readonly');
    });

    it('still submits its value with the form', () => {
      const {container} = render(
        <form>
          <NumberInput
            label="Quantity"
            htmlName="quantity"
            value={42}
            onChange={() => {}}
            isReadOnly
          />
        </form>,
      );
      expect(
        new FormData(container.querySelector('form')!).get('quantity'),
      ).toBe('42');
    });

    it('does not call onChange when the user types', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      render(
        <NumberInput
          label="Quantity"
          value={42}
          onChange={handleChange}
          isReadOnly
        />,
      );
      await user.type(screen.getByRole('spinbutton'), '7');
      expect(handleChange).not.toHaveBeenCalled();
    });

    it('stays focusable and is not disabled', async () => {
      const user = userEvent.setup();
      render(
        <NumberInput
          label="Quantity"
          value={42}
          onChange={() => {}}
          isReadOnly
        />,
      );
      const input = screen.getByRole('spinbutton');
      expect(input).not.toBeDisabled();
      await user.tab();
      expect(input).toHaveFocus();
    });

    it('hides the clear button', () => {
      render(
        <NumberInput
          label="Quantity"
          value={42}
          onChange={() => {}}
          hasClear
          isReadOnly
        />,
      );
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('does not step on ArrowUp or ArrowDown', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      render(
        <NumberInput
          label="Quantity"
          value={42}
          onChange={handleChange}
          isReadOnly
        />,
      );
      const input = screen.getByRole('spinbutton');
      input.focus();
      await user.keyboard('{ArrowUp}{ArrowDown}');
      expect(handleChange).not.toHaveBeenCalled();
      expect(input).toHaveValue('42');
    });

    it('leaves wheel scrolling to the page instead of stepping', () => {
      const onScrollableWheel = vi.fn();
      const handleChange = vi.fn();
      render(
        <div onWheel={onScrollableWheel}>
          <NumberInput
            label="Quantity"
            value={42}
            onChange={handleChange}
            isReadOnly
          />
        </div>,
      );
      const input = screen.getByRole('spinbutton');
      input.focus();
      const event = new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        deltaY: -100,
      });
      fireEvent(input, event);

      expect(handleChange).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
      expect(onScrollableWheel).toHaveBeenCalledTimes(1);
    });

    it('disables both number steppers', () => {
      const handleChange = vi.fn();
      render(
        <NumberInput
          label="Quantity"
          value={42}
          onChange={handleChange}
          hasNumberSteppers
          isReadOnly
        />,
      );
      const increment = screen.getByRole('button', {
        name: 'Increment Quantity',
      });
      expect(increment).toHaveAttribute('aria-disabled', 'true');
      expect(
        screen.getByRole('button', {name: 'Decrement Quantity'}),
      ).toHaveAttribute('aria-disabled', 'true');

      fireEvent.click(increment);
      expect(handleChange).not.toHaveBeenCalled();
    });

    it('lets isDisabled win when both are set', () => {
      const {container} = render(
        <form>
          <NumberInput
            label="Quantity"
            htmlName="quantity"
            value={42}
            onChange={() => {}}
            isReadOnly
            isDisabled
          />
        </form>,
      );
      expect(screen.getByRole('spinbutton')).toHaveAttribute(
        'aria-disabled',
        'true',
      );
      expect([
        ...new FormData(container.querySelector('form')!).keys(),
      ]).toEqual([]);
    });
  });

  describe('autoComplete prop', () => {
    it('sets autocomplete attribute when autoComplete is provided', () => {
      render(
        <NumberInput
          label="Age"
          value={null}
          onChange={() => {}}
          autoComplete="off"
        />,
      );
      expect(screen.getByRole('spinbutton')).toHaveAttribute(
        'autocomplete',
        'off',
      );
    });
  });

  describe('hasClear', () => {
    it('shows clear button when hasClear is true and value exists', () => {
      render(
        <NumberInput label="Qty" value={5} onChange={() => {}} hasClear />,
      );
      expect(
        screen.getByRole('button', {name: 'Clear Qty'}),
      ).toBeInTheDocument();
    });

    it('focuses the field inside the tap that clears it, without scrolling', () => {
      // iOS Safari brings up its keyboard only for a focus made while
      // handling the touch.
      const onChange = vi.fn();
      const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus');
      render(
        <NumberInput label="Qty" value={5} onChange={onChange} hasClear />,
      );
      const input = screen.getByRole('spinbutton');
      fireEvent.click(screen.getByRole('button', {name: 'Clear Qty'}), {
        detail: 1,
      });
      expect(onChange).toHaveBeenCalledWith(null);
      expect(document.activeElement).toBe(input);
      expect(focusSpy).toHaveBeenLastCalledWith({preventScroll: true});
      focusSpy.mockRestore();
    });

    it('does not show clear button when value is null', () => {
      render(
        <NumberInput label="Qty" value={null} onChange={() => {}} hasClear />,
      );
      expect(
        screen.queryByRole('button', {name: 'Clear Qty'}),
      ).not.toBeInTheDocument();
    });

    it('keeps Tab moving forward when an empty field has an invalid draft', async () => {
      const user = userEvent.setup();
      render(
        <>
          <NumberInput label="Qty" value={null} onChange={() => {}} hasClear />
          <button type="button">Next field</button>
        </>,
      );
      const input = screen.getByRole('spinbutton');
      await user.click(input);
      await user.type(input, 'invalid');
      expect(
        screen.queryByRole('button', {name: 'Clear Qty'}),
      ).not.toBeInTheDocument();

      await user.tab();
      expect(screen.getByRole('button', {name: 'Next field'})).toHaveFocus();
    });

    it('does not show clear button when hasClear is false', () => {
      render(<NumberInput label="Qty" value={5} onChange={() => {}} />);
      expect(
        screen.queryByRole('button', {name: 'Clear Qty'}),
      ).not.toBeInTheDocument();
    });

    it('does not show clear button when disabled', () => {
      render(
        <NumberInput
          label="Qty"
          value={5}
          onChange={() => {}}
          hasClear
          isDisabled
        />,
      );
      expect(
        screen.queryByRole('button', {name: 'Clear Qty'}),
      ).not.toBeInTheDocument();
    });

    it('calls onChange with null when clear is clicked', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <NumberInput label="Qty" value={5} onChange={onChange} hasClear />,
      );
      await user.click(screen.getByRole('button', {name: 'Clear Qty'}));
      expect(onChange).toHaveBeenCalledWith(null);
    });
  });

  describe('click-to-focus', () => {
    it('focuses input when clicking the start icon', () => {
      render(
        <NumberInput
          label="Qty"
          value={0}
          onChange={() => {}}
          startIcon={<TestIcon />}
        />,
      );

      const input = screen.getByRole('spinbutton');
      const wrapper = input.parentElement!;
      const iconElement = wrapper.querySelector('svg')!;

      fireEvent.click(iconElement);
      expect(input).toHaveFocus();
    });

    it('focuses input when clicking the wrapper padding', () => {
      render(<NumberInput label="Qty" value={0} onChange={() => {}} />);

      const input = screen.getByRole('spinbutton');
      const wrapper = input.parentElement!;

      fireEvent.click(wrapper);
      expect(input).toHaveFocus();
    });
  });

  describe('disabledMessage', () => {
    it('shows the reason tooltip on hover when disabled with a reason', async () => {
      render(
        <NumberInput
          label="Quantity"
          value={5}
          onChange={() => {}}
          isDisabled
          disabledMessage="You need the Editor role"
        />,
      );

      const input = screen.getByRole('spinbutton');
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
        <NumberInput
          label="Quantity"
          value={5}
          onChange={() => {}}
          isDisabled
          disabledMessage="You need the Editor role"
        />,
      );

      const tooltip = screen.getByRole('tooltip', h);
      await user.tab();
      expect(screen.getByRole('spinbutton')).toHaveFocus();
      await waitFor(() => {
        expect(tooltip).toHaveAttribute('popover-open');
      });
    });

    it('does not render a tooltip when not disabled', () => {
      render(
        <NumberInput
          label="Quantity"
          value={5}
          onChange={() => {}}
          disabledMessage="You need the Editor role"
        />,
      );
      expect(screen.queryByRole('tooltip', h)).not.toBeInTheDocument();
    });

    it('does not render a tooltip when disabled without a reason', () => {
      render(
        <NumberInput
          label="Quantity"
          value={5}
          onChange={() => {}}
          isDisabled
        />,
      );
      expect(screen.queryByRole('tooltip', h)).not.toBeInTheDocument();
    });

    it('keeps the input focusable via aria-disabled when a reason is provided', () => {
      render(
        <NumberInput
          label="Quantity"
          value={5}
          onChange={() => {}}
          isDisabled
          disabledMessage="You need the Editor role"
        />,
      );
      const input = screen.getByRole('spinbutton');
      expect(input).not.toBeDisabled();
      expect(input).toHaveAttribute('aria-disabled', 'true');
      expect(input).toHaveAttribute('readonly');
    });

    it('links the reason tooltip from the input via aria-describedby', () => {
      render(
        <NumberInput
          label="Quantity"
          value={5}
          onChange={() => {}}
          isDisabled
          disabledMessage="You need the Editor role"
        />,
      );
      const input = screen.getByRole('spinbutton');
      const tooltip = screen.getByRole('tooltip', h);
      expect(input.getAttribute('aria-describedby')).toContain(tooltip.id);
    });

    it('blocks value changes while focusable-disabled', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <NumberInput
          label="Quantity"
          value={5}
          onChange={onChange}
          isDisabled
          disabledMessage="You need the Editor role"
        />,
      );

      const input = screen.getByRole('spinbutton');
      await user.click(input);
      await user.keyboard('9');
      expect(onChange).not.toHaveBeenCalled();
    });

    it('stays focusable when disabled without a reason', () => {
      render(
        <NumberInput
          label="Quantity"
          value={5}
          onChange={() => {}}
          isDisabled
        />,
      );
      const input = screen.getByRole('spinbutton');
      expect(input).not.toBeDisabled();
      expect(input).toHaveAttribute('aria-disabled', 'true');
    });
  });
});

describe('keyboard clearing with hasClear (#3599)', () => {
  it('commits null when the input is emptied and blurred', () => {
    const onChange = vi.fn();
    render(<NumberInput label="Qty" hasClear value={42} onChange={onChange} />);
    const input = screen.getByLabelText('Qty');
    fireEvent.change(input, {target: {value: ''}});
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('commits null when the input is emptied and Enter is pressed', () => {
    const onChange = vi.fn();
    render(<NumberInput label="Qty" hasClear value={42} onChange={onChange} />);
    const input = screen.getByLabelText('Qty');
    fireEvent.change(input, {target: {value: ''}});
    fireEvent.keyDown(input, {key: 'Enter'});
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('does not fire when emptied and blurred with no prior value', () => {
    const onChange = vi.fn();
    render(
      <NumberInput label="Qty" hasClear value={null} onChange={onChange} />,
    );
    const input = screen.getByLabelText('Qty');
    fireEvent.change(input, {target: {value: ''}});
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('still reverts on blur when hasClear is not set', () => {
    const onChange = vi.fn();
    render(<NumberInput label="Qty" value={42} onChange={onChange} />);
    const input = screen.getByLabelText('Qty');
    fireEvent.change(input, {target: {value: ''}});
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe('42');
  });
});

describe('NumberInput statusVariant forwarding', () => {
  it('defaults to attached (status renders with data-variant="attached")', () => {
    const {container} = render(
      <NumberInput
        label="Amount"
        value={null}
        onChange={() => {}}
        status={{type: 'error', message: 'Must be positive'}}
      />,
    );
    expect(container.querySelector('.astryx-field-status')).toHaveAttribute(
      'data-variant',
      'attached',
    );
  });

  it('forwards statusVariant="detached" to the underlying Field status', () => {
    const {container} = render(
      <NumberInput
        label="Amount"
        value={null}
        onChange={() => {}}
        status={{type: 'error', message: 'Must be positive'}}
        statusVariant="detached"
      />,
    );
    expect(container.querySelector('.astryx-field-status')).toHaveAttribute(
      'data-variant',
      'detached',
    );
  });
});

describe('NumberInput stepping', () => {
  const stepInteractions = [
    [
      'keyboard',
      (input: HTMLElement, direction: 'up' | 'down') =>
        fireEvent.keyDown(input, {
          key: direction === 'up' ? 'ArrowUp' : 'ArrowDown',
        }),
    ],
    [
      'wheel',
      (input: HTMLElement, direction: 'up' | 'down') => {
        input.focus();
        act(() => {
          fireEvent.wheel(input, {deltaY: direction === 'up' ? -100 : 100});
        });
      },
    ],
    [
      'number stepper',
      (_input: HTMLElement, direction: 'up' | 'down') =>
        fireEvent.click(
          screen.getByRole('button', {
            name: direction === 'up' ? 'Increment Amount' : 'Decrement Amount',
          }),
        ),
    ],
  ] as const;

  it('increments with ArrowUp and decrements with ArrowDown', () => {
    const onChange = vi.fn();
    render(<NumberInput label="Amount" value={5} onChange={onChange} />);
    const input = screen.getByRole('spinbutton');

    fireEvent.keyDown(input, {key: 'ArrowUp'});
    expect(onChange).toHaveBeenLastCalledWith(6);

    fireEvent.keyDown(input, {key: 'ArrowDown'});
    expect(onChange).toHaveBeenLastCalledWith(4);
  });

  it('does not step or commit on a composing keydown (IME)', () => {
    const onChange = vi.fn();
    render(<NumberInput label="Amount" value={5} onChange={onChange} />);
    const input = screen.getByRole('spinbutton');

    // The field is type="text", so an IME composes into it. Enter commits the
    // candidate and the arrows walk the candidate window; neither should reach
    // the stepping or commit paths. Both signals a browser may report.
    fireEvent.keyDown(input, {key: 'ArrowUp', isComposing: true});
    fireEvent.keyDown(input, {key: 'ArrowDown', keyCode: 229});
    fireEvent.keyDown(input, {key: 'Enter', isComposing: true});
    expect(onChange).not.toHaveBeenCalled();

    // A real, non-composing ArrowUp still steps.
    fireEvent.keyDown(input, {key: 'ArrowUp'});
    expect(onChange).toHaveBeenLastCalledWith(6);
  });

  it('lets onKeyDown cancel keyboard stepping', () => {
    const onChange = vi.fn();
    const onKeyDown = vi.fn((event: React.KeyboardEvent<HTMLInputElement>) =>
      event.preventDefault(),
    );
    render(
      <NumberInput
        label="Amount"
        value={5}
        onChange={onChange}
        onKeyDown={onKeyDown}
      />,
    );
    fireEvent.keyDown(screen.getByRole('spinbutton'), {key: 'ArrowUp'});

    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('uses decimal-safe step arithmetic', () => {
    const onChange = vi.fn();
    render(
      <NumberInput label="Amount" value={0.2} onChange={onChange} step={0.1} />,
    );
    fireEvent.keyDown(screen.getByRole('spinbutton'), {key: 'ArrowUp'});
    expect(onChange).toHaveBeenCalledWith(0.3);
  });

  it('aligns an off-step value in the requested direction', () => {
    const onChange = vi.fn();
    render(
      <NumberInput
        label="Amount"
        value={0.25}
        onChange={onChange}
        step={0.1}
      />,
    );
    const input = screen.getByRole('spinbutton');

    fireEvent.keyDown(input, {key: 'ArrowUp'});
    expect(onChange).toHaveBeenLastCalledWith(0.3);

    fireEvent.keyDown(input, {key: 'ArrowDown'});
    expect(onChange).toHaveBeenLastCalledWith(0.2);
  });

  it('starts an empty value at the relevant boundary', () => {
    const onChange = vi.fn();
    const {rerender} = render(
      <NumberInput label="Amount" value={null} onChange={onChange} min={2} />,
    );
    fireEvent.keyDown(screen.getByRole('spinbutton'), {key: 'ArrowUp'});
    expect(onChange).toHaveBeenLastCalledWith(2);

    rerender(
      <NumberInput label="Amount" value={null} onChange={onChange} max={8} />,
    );
    fireEvent.keyDown(screen.getByRole('spinbutton'), {key: 'ArrowDown'});
    expect(onChange).toHaveBeenLastCalledWith(8);
  });

  it('keeps generated values integral when isIntegerOnly is set', () => {
    const onChange = vi.fn();
    render(
      <NumberInput
        label="Amount"
        value={null}
        onChange={onChange}
        min={2.5}
        isIntegerOnly
      />,
    );
    fireEvent.keyDown(screen.getByRole('spinbutton'), {key: 'ArrowUp'});
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it('does not step past min or max', () => {
    const onChange = vi.fn();
    const {rerender} = render(
      <NumberInput
        label="Amount"
        value={10}
        onChange={onChange}
        min={0}
        max={10}
      />,
    );
    fireEvent.keyDown(screen.getByRole('spinbutton'), {key: 'ArrowUp'});
    expect(onChange).not.toHaveBeenCalled();

    rerender(
      <NumberInput
        label="Amount"
        value={0}
        onChange={onChange}
        min={0}
        max={10}
      />,
    );
    fireEvent.keyDown(screen.getByRole('spinbutton'), {key: 'ArrowDown'});
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each(stepInteractions)(
    'clamps at a fractional max after rounding via the %s',
    (_name, interact) => {
      const onChange = vi.fn();
      render(
        <NumberInput
          label="Amount"
          value={99}
          onChange={onChange}
          max={99.99}
          hasNumberSteppers
        />,
      );

      interact(screen.getByRole('spinbutton'), 'up');

      expect(onChange).toHaveBeenCalledWith(99.99);
      expect(onChange).not.toHaveBeenCalledWith(100);
    },
  );

  it.each(stepInteractions)(
    'clamps at a fractional min after rounding via the %s',
    (_name, interact) => {
      const onChange = vi.fn();
      const min = 4e-13;
      render(
        <NumberInput
          label="Amount"
          value={0.5}
          onChange={onChange}
          min={min}
          hasNumberSteppers
        />,
      );

      interact(screen.getByRole('spinbutton'), 'down');

      expect(onChange).toHaveBeenCalledWith(min);
      expect(onChange).not.toHaveBeenCalledWith(0);
    },
  );

  it('reflects a reached fractional max in the spinbutton and stepper state', () => {
    function ControlledNumberInput() {
      const [value, setValue] = useState(99);
      return (
        <NumberInput
          label="Amount"
          value={value}
          onChange={setValue}
          max={99.99}
          hasNumberSteppers
        />
      );
    }
    render(<ControlledNumberInput />);

    const input = screen.getByRole('spinbutton');
    const increment = screen.getByRole('button', {name: 'Increment Amount'});
    expect(increment).not.toHaveAttribute('aria-disabled');

    fireEvent.click(increment);

    expect(input).toHaveValue('99.99');
    expect(input).toHaveAttribute('aria-valuenow', '99.99');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(increment).toHaveAttribute('aria-disabled', 'true');
  });

  it('allows wheel stepping by default and consumes the focused gesture', () => {
    const onScrollableWheel = vi.fn();
    const onChange = vi.fn();
    render(
      <div onWheel={onScrollableWheel}>
        <NumberInput label="Amount" value={5} onChange={onChange} />
      </div>,
    );
    const input = screen.getByRole('spinbutton');
    input.focus();
    const event = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: -100,
    });
    fireEvent(input, event);

    expect(onChange).toHaveBeenCalledWith(6);
    expect(event.defaultPrevented).toBe(true);
    expect(onScrollableWheel).not.toHaveBeenCalled();
  });

  it('leaves wheel scrolling alone when isWheelEnabled is false', () => {
    const onScrollableWheel = vi.fn();
    const onChange = vi.fn();
    render(
      <div onWheel={onScrollableWheel}>
        <NumberInput
          label="Amount"
          value={5}
          onChange={onChange}
          isWheelEnabled={false}
        />
      </div>,
    );
    const input = screen.getByRole('spinbutton');
    input.focus();
    const event = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: -100,
    });
    fireEvent(input, event);

    expect(onChange).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    expect(onScrollableWheel).toHaveBeenCalledTimes(1);
  });

  it('updates the wheel listener when isWheelEnabled changes', () => {
    const onScrollableWheel = vi.fn();
    const onChange = vi.fn();
    const {rerender} = render(
      <div onWheel={onScrollableWheel}>
        <NumberInput
          label="Amount"
          value={5}
          onChange={onChange}
          isWheelEnabled={false}
        />
      </div>,
    );
    const input = screen.getByRole('spinbutton');
    input.focus();

    rerender(
      <div onWheel={onScrollableWheel}>
        <NumberInput
          label="Amount"
          value={5}
          onChange={onChange}
          isWheelEnabled
        />
      </div>,
    );
    fireEvent.wheel(input, {deltaY: -100});
    expect(onChange).toHaveBeenCalledWith(6);
    expect(onScrollableWheel).not.toHaveBeenCalled();

    onChange.mockClear();
    rerender(
      <div onWheel={onScrollableWheel}>
        <NumberInput
          label="Amount"
          value={5}
          onChange={onChange}
          isWheelEnabled={false}
        />
      </div>,
    );
    fireEvent.wheel(input, {deltaY: -100});
    expect(onChange).not.toHaveBeenCalled();
    expect(onScrollableWheel).toHaveBeenCalledTimes(1);
  });

  it('leaves wheel scrolling alone when the input is not focused', () => {
    const onScrollableWheel = vi.fn();
    const onChange = vi.fn();
    render(
      <div onWheel={onScrollableWheel}>
        <NumberInput label="Amount" value={5} onChange={onChange} />
      </div>,
    );
    const input = screen.getByRole('spinbutton');
    const event = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: 100,
    });
    fireEvent(input, event);

    expect(onChange).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    expect(onScrollableWheel).toHaveBeenCalledTimes(1);
  });

  it('leaves modified wheel gestures alone', () => {
    const onScrollableWheel = vi.fn();
    const onChange = vi.fn();
    render(
      <div onWheel={onScrollableWheel}>
        <NumberInput label="Amount" value={5} onChange={onChange} />
      </div>,
    );
    const input = screen.getByRole('spinbutton');
    input.focus();
    fireEvent.wheel(input, {deltaY: -100, ctrlKey: true});

    expect(onChange).not.toHaveBeenCalled();
    expect(onScrollableWheel).toHaveBeenCalledTimes(1);
  });

  it('leaves wheel scrolling alone when the input is aria-disabled', () => {
    const onScrollableWheel = vi.fn();
    const onChange = vi.fn();
    render(
      <div onWheel={onScrollableWheel}>
        <NumberInput
          label="Amount"
          value={5}
          onChange={onChange}
          isDisabled
          disabledMessage="This value is locked"
        />
      </div>,
    );
    const input = screen.getByRole('spinbutton');
    input.focus();
    fireEvent.wheel(input, {deltaY: -100});

    expect(onChange).not.toHaveBeenCalled();
    expect(onScrollableWheel).toHaveBeenCalledTimes(1);
  });

  describe('hasNumberSteppers', () => {
    it('does not show stepper buttons by default', () => {
      render(<NumberInput label="Quantity" value={5} onChange={() => {}} />);
      expect(
        screen.queryByRole('button', {name: 'Increment Quantity'}),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', {name: 'Decrement Quantity'}),
      ).not.toBeInTheDocument();
    });

    it('shows localized increment and decrement buttons when enabled', () => {
      render(
        <NumberInput
          label="Quantity"
          value={5}
          onChange={() => {}}
          hasNumberSteppers
        />,
      );
      expect(
        screen.getByRole('button', {name: 'Increment Quantity'}),
      ).toHaveAttribute('tabindex', '-1');
      expect(
        screen.getByRole('button', {name: 'Decrement Quantity'}),
      ).toHaveAttribute('tabindex', '-1');
    });

    it('uses the NumberInput extension icon for both stepper buttons', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      registerIcons({
        chevronDown: <svg data-testid="generic-chevron-down" />,
        'numberInput:stepperDown': <svg data-testid="number-stepper-down" />,
      });

      render(
        <NumberInput
          label="Quantity"
          value={5}
          onChange={() => {}}
          hasNumberSteppers
        />,
      );

      const stepperIcons = screen.getAllByTestId('number-stepper-down');
      expect(stepperIcons).toHaveLength(2);
      for (const icon of stepperIcons) {
        expect(icon.parentElement).toHaveAttribute('data-size', 'xsm');
      }
      expect(
        screen.queryByTestId('generic-chevron-down'),
      ).not.toBeInTheDocument();
      warnSpy.mockRestore();
    });

    it('steps the value and returns focus to the input', () => {
      const onChange = vi.fn();
      render(
        <NumberInput
          label="Quantity"
          value={5}
          onChange={onChange}
          hasNumberSteppers
        />,
      );
      const input = screen.getByRole('spinbutton');

      fireEvent.click(screen.getByRole('button', {name: 'Increment Quantity'}));
      expect(onChange).toHaveBeenLastCalledWith(6);
      expect(input).toHaveFocus();

      fireEvent.click(screen.getByRole('button', {name: 'Decrement Quantity'}));
      expect(onChange).toHaveBeenLastCalledWith(4);
      expect(input).toHaveFocus();
    });

    it('disables only the stepper at the reached boundary', () => {
      render(
        <NumberInput
          label="Quantity"
          value={10}
          onChange={() => {}}
          min={0}
          max={10}
          hasNumberSteppers
        />,
      );
      expect(
        screen.getByRole('button', {name: 'Increment Quantity'}),
      ).toHaveAttribute('aria-disabled', 'true');
      expect(
        screen.getByRole('button', {name: 'Decrement Quantity'}),
      ).not.toHaveAttribute('aria-disabled');
    });

    it('commits nothing from a click on the stepper at the reached boundary (spec:AST-085 FR2)', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <NumberInput
          label="Quantity"
          value={5}
          onChange={onChange}
          min={0}
          max={10}
          hasNumberSteppers
        />,
      );
      const input = screen.getByRole('spinbutton');
      await user.clear(input);
      await user.type(input, '10');
      onChange.mockClear();
      await user.click(
        screen.getByRole('button', {name: 'Increment Quantity'}),
      );
      expect(onChange).not.toHaveBeenCalled();
    });

    it('disables both steppers with the input', () => {
      render(
        <NumberInput
          label="Quantity"
          value={5}
          onChange={() => {}}
          hasNumberSteppers
          isDisabled
        />,
      );
      expect(
        screen.getByRole('button', {name: 'Increment Quantity'}),
      ).toHaveAttribute('aria-disabled', 'true');
      expect(
        screen.getByRole('button', {name: 'Decrement Quantity'}),
      ).toHaveAttribute('aria-disabled', 'true');
    });
  });
});

describe('NumberInput disabled theme state', () => {
  it('reflects disabled on the root target so themes can gate paint on it', () => {
    const {container} = render(
      <NumberInput
        label="Quantity"
        value={null}
        onChange={() => {}}
        isDisabled
      />,
    );
    const root = container.querySelector('.astryx-number-input');
    expect(root).toHaveAttribute('data-disabled', 'disabled');
  });

  it('omits data-disabled when enabled, like status does', () => {
    const {container} = render(
      <NumberInput label="Quantity" value={null} onChange={() => {}} />,
    );
    const root = container.querySelector('.astryx-number-input');
    expect(root).not.toHaveAttribute('data-disabled');
  });
});

describe('NumberInput readonly theme state', () => {
  it('reflects readonly on the root target so themes can gate paint on it', () => {
    const {container} = render(
      <NumberInput label="Qty" value={1} onChange={() => {}} isReadOnly />,
    );
    const root = container.querySelector('.astryx-number-input');
    expect(root).toHaveAttribute('data-readonly', 'readonly');
  });

  it('omits data-readonly when editable', () => {
    const {container} = render(
      <NumberInput label="Qty" value={1} onChange={() => {}} />,
    );
    const root = container.querySelector('.astryx-number-input');
    expect(root).not.toHaveAttribute('data-readonly');
  });
});

describe('NumberInput stepper padding coupling', () => {
  function generateThemeTestCSS(theme: Parameters<typeof generateThemeCSS>[0]) {
    const {prose, component} = generateThemeCSS(theme);
    return [prose, component].filter(Boolean).join('\n\n');
  }

  // The chains the wrapper and the stepper column both read. Spelled out here
  // rather than imported so the test pins the actual token names a theme sets:
  // if the chain is renamed or a level is dropped, this fails.
  const BLOCK_START =
    'var(--astryx-number-input-padding-block-start, var(--astryx-number-input-padding, var(--spacing-1)))';
  const BLOCK_END =
    'var(--astryx-number-input-padding-block-end, var(--astryx-number-input-padding, var(--spacing-1)))';

  // jsdom re-serializes a var() chain without the spaces after its commas.
  const noSpace = (value: string) => value.replace(/\s+/g, '');

  it('reads its padding from the public number-input padding tokens', () => {
    const {container} = render(
      <NumberInput
        label="Quantity"
        value={5}
        onChange={() => {}}
        hasNumberSteppers
      />,
    );
    const root = container.querySelector('.astryx-number-input') as HTMLElement;
    // Read as physical properties: StyleX compiles the block-axis logical
    // properties to `padding-top`/`padding-bottom` (identical in every
    // horizontal writing mode). Per side, not through the shared field base's
    // `paddingBlock` shorthand, so each edge can be cancelled on its own.
    const wrapper = getComputedStyle(root);
    expect(noSpace(wrapper.paddingTop)).toBe(noSpace(BLOCK_START));
    expect(noSpace(wrapper.paddingBottom)).toBe(noSpace(BLOCK_END));

    // The column cancels the wrapper's block padding by reading the same
    // tokens — not a hardcoded default — so it stays flush when a theme
    // changes the padding. The column is the stepper buttons' direct parent.
    const steppers = container.querySelector(
      'button[aria-label="Increment Quantity"]',
    )?.parentElement as HTMLElement;
    const column = getComputedStyle(steppers);
    expect(noSpace(column.marginTop)).toBe(
      noSpace(`calc(-1 * ${BLOCK_START})`),
    );
    expect(noSpace(column.marginBottom)).toBe(
      noSpace(`calc(-1 * ${BLOCK_END})`),
    );
  });

  // jsdom cannot resolve the @layer cascade, so the generated CSS is the
  // proof. Each case is a spelling of the SAME declaration: the column has to
  // track all of them, not just the one the component happened to name.
  describe('a themed padding reaches the steppers in every spelling', () => {
    it.each([
      [
        'the padding shorthand, two values',
        {padding: '14px 20px'},
        [
          '--astryx-number-input-padding-block-start: 14px',
          '--astryx-number-input-padding-block-end: 14px',
          '--astryx-number-input-padding-inline: 20px',
        ],
      ],
      [
        'the padding shorthand, one value',
        {padding: '10px'},
        ['--astryx-number-input-padding: 10px'],
      ],
      [
        'the block/inline longhands',
        {paddingBlock: '10px', paddingInline: '20px'},
        [
          '--astryx-number-input-padding-block-start: 10px',
          '--astryx-number-input-padding-block-end: 10px',
          '--astryx-number-input-padding-inline: 20px',
        ],
      ],
      [
        'a single edge longhand',
        {paddingBlockStart: '12px'},
        ['--astryx-number-input-padding-block-start: 12px'],
      ],
      [
        // A single var carrying "4px 12px" would make the column's
        // calc(-1 * …) invalid and drop the margin outright; the expansion
        // splits the two values into their own edges instead.
        'an asymmetric block padding',
        {paddingBlock: '4px 12px'},
        [
          '--astryx-number-input-padding-block-start: 4px',
          '--astryx-number-input-padding-block-end: 12px',
        ],
      ],
      [
        // `paddingTop` is `paddingBlockStart` in every horizontal writing
        // mode, so it normalizes onto the same tokens. The physical inline
        // pair is deliberately not mapped — see generateThemeRules.
        'the physical block longhands',
        {paddingTop: '14px', paddingBottom: '6px'},
        [
          '--astryx-number-input-padding-block-start: 14px',
          '--astryx-number-input-padding-block-end: 6px',
        ],
      ],
    ])('%s', (_label, base, expected) => {
      const theme = defineTheme({
        name: 'number-input-padding-spelling-test',
        components: {'number-input': {base}},
      });
      const css = generateThemeTestCSS(theme);
      for (const declaration of expected) {
        expect(css).toContain(declaration);
      }
      // The expansion consumes the padding: a raw declaration left on the
      // wrapper is padding the column cannot see, which is the gap itself.
      expect(css).not.toMatch(
        /^\s*padding(-block|-inline|-top|-bottom)?(-start|-end)?:/m,
      );
    });
  });

  it('carries a themed border radius to the stepper column corners', () => {
    // The column's outer corners read --_field-radius. Emitting only
    // `border-radius` on the wrapper rounds the field and leaves the steppers
    // at the default radius, which is visible wherever the two differ.
    const theme = defineTheme({
      name: 'number-input-radius-test',
      components: {'number-input': {base: {borderRadius: '2px'}}},
    });
    const css = generateThemeTestCSS(theme);
    expect(css).toContain('--_field-radius: 2px');
    expect(css).toContain('border-radius: 2px');
  });
});
