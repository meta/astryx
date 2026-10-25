// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TextArea.test.tsx
 * @input Uses vitest, @testing-library/react, TextArea component
 * @output Unit tests for TextArea component behavior
 * @position Testing; validates TextArea.tsx implementation
 *
 * SYNC: When TextArea.tsx changes, update tests to match new behavior
 */

import {useState} from 'react';
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {render, screen, fireEvent, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as stylex from '@stylexjs/stylex';
import {colorVars} from '../theme/tokens.stylex';
import {TestIcon} from '../__tests__/TestIcon';
import {TextArea} from './TextArea';
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

/** A busy control's Spinner is decorative and silent (spec:AST-086 FR8). */
function expectSilentBusySpinner() {
  const spinner = document.querySelector('.astryx-spinner');
  expect(spinner).not.toBeNull();
  expect(spinner).toHaveAttribute('aria-hidden', 'true');
  expect(screen.queryByRole('status', {name: 'Loading'})).toBeNull();
}

describe('TextArea', () => {
  it('renders with label', () => {
    render(<TextArea label="Description" value="" onChange={() => {}} />);
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
  });

  it('renders with placeholder', () => {
    render(
      <TextArea
        label="Description"
        value=""
        onChange={() => {}}
        placeholder="Enter description"
      />,
    );
    expect(
      screen.getByPlaceholderText('Enter description'),
    ).toBeInTheDocument();
  });

  it('calls onChange with value and event when typing', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<TextArea label="Description" value="" onChange={handleChange} />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Hi');
    expect(handleChange).toHaveBeenCalledTimes(2);
    expect(handleChange).toHaveBeenLastCalledWith('i', expect.any(Object));
  });

  it('works with state setter function directly', async () => {
    const user = userEvent.setup();
    const setValue = vi.fn();
    render(<TextArea label="Description" value="" onChange={setValue} />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'A');
    expect(setValue).toHaveBeenCalledWith('A', expect.any(Object));
  });

  it('displays controlled value', () => {
    render(
      <TextArea
        label="Description"
        value="Controlled value"
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole('textbox')).toHaveValue('Controlled value');
  });

  it('forwards ref correctly', () => {
    const ref = vi.fn();
    render(
      <TextArea ref={ref} label="Description" value="" onChange={() => {}} />,
    );
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLTextAreaElement));
  });

  it('visually hides label when isLabelHidden is true', () => {
    render(
      <TextArea label="Comments" isLabelHidden value="" onChange={() => {}} />,
    );
    const label = screen.getByText('Comments');
    expect(label).toBeInTheDocument();
    // Label should still be accessible
    expect(screen.getByLabelText('Comments')).toBeInTheDocument();
  });

  it('shows label visually by default', () => {
    render(<TextArea label="Notes" value="" onChange={() => {}} />);
    const label = screen.getByText('Notes');
    expect(label).toBeVisible();
  });

  it('sets aria-required when isRequired is true', () => {
    render(
      <TextArea label="Feedback" isRequired value="" onChange={() => {}} />,
    );
    expect(screen.getByRole('textbox')).toHaveAttribute(
      'aria-required',
      'true',
    );
  });

  it('does not set aria-required when isRequired is false', () => {
    render(<TextArea label="Feedback" value="" onChange={() => {}} />);
    expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-required');
  });

  it('renders with custom rows', () => {
    render(
      <TextArea label="Description" value="" onChange={() => {}} rows={5} />,
    );
    expect(screen.getByRole('textbox')).toHaveAttribute('rows', '5');
  });

  it('renders with default rows of 3', () => {
    render(<TextArea label="Description" value="" onChange={() => {}} />);
    expect(screen.getByRole('textbox')).toHaveAttribute('rows', '3');
  });

  it('exposes aria-disabled and read-only, not native disabled, when isDisabled is true', () => {
    render(
      <TextArea label="Description" isDisabled value="" onChange={() => {}} />,
    );
    const textarea = screen.getByRole('textbox');
    expect(textarea).not.toBeDisabled();
    expect(textarea).toHaveAttribute('aria-disabled', 'true');
    expect(textarea).toHaveAttribute('readonly');
  });

  it('keeps a disabled textarea in the tab order (spec:AST-085)', async () => {
    const user = userEvent.setup();
    render(
      <>
        <TextArea label="First" value="" onChange={() => {}} />
        <TextArea label="Second" isDisabled value="" onChange={() => {}} />
        <TextArea label="Third" value="" onChange={() => {}} />
      </>,
    );
    await user.tab();
    await user.tab();
    expect(screen.getByRole('textbox', {name: 'Second'})).toHaveFocus();
  });

  it('runs no caller handler from a disabled textarea and rings it under focus (spec:AST-085 FR2, FR6)', async () => {
    const user = userEvent.setup();
    const handlers = {onPaste: vi.fn(), onKeyDown: vi.fn()};
    render(
      <TextArea
        label="Notes"
        isDisabled
        value=""
        onChange={() => {}}
        {...handlers}
      />,
    );
    const textarea = screen.getByRole('textbox');
    await user.click(textarea);
    await user.keyboard('a');
    await user.paste('x');
    for (const handler of Object.values(handlers)) {
      expect(handler).not.toHaveBeenCalled();
    }
    expect(textarea.parentElement).toHaveClass(RING);
  });

  it('is not disabled by default', () => {
    render(<TextArea label="Description" value="" onChange={() => {}} />);
    expect(screen.getByRole('textbox')).not.toBeDisabled();
  });

  it('shows aria-busy when isLoading is true', () => {
    render(
      <TextArea label="Description" isLoading value="" onChange={() => {}} />,
    );
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('textbox')).not.toBeDisabled();
  });

  it('does not call onChange when disabled', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <TextArea
        label="Description"
        isDisabled
        value=""
        onChange={handleChange}
      />,
    );

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Hi');
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('renders with startIcon', () => {
    render(
      <TextArea
        label="Description"
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
      <TextArea label="Description" value="" onChange={() => {}} />,
    );
    // No SVG should be present
    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });

  describe('status prop', () => {
    it('renders with error status icon', () => {
      const {container} = render(
        <TextArea
          label="Description"
          value=""
          onChange={() => {}}
          status={{type: 'error'}}
        />,
      );
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('renders with warning status icon', () => {
      const {container} = render(
        <TextArea
          label="Description"
          value=""
          onChange={() => {}}
          status={{type: 'warning'}}
        />,
      );
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('renders with success status icon', () => {
      const {container} = render(
        <TextArea
          label="Description"
          value=""
          onChange={() => {}}
          status={{type: 'success'}}
        />,
      );
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('renders status message when provided', () => {
      render(
        <TextArea
          label="Description"
          value=""
          onChange={() => {}}
          status={{type: 'error', message: 'Description is required'}}
        />,
      );
      expect(screen.getByText('Description is required')).toBeInTheDocument();
    });

    it('does not render status message when not provided', () => {
      render(
        <TextArea
          label="Description"
          value=""
          onChange={() => {}}
          status={{type: 'error'}}
        />,
      );
      expect(screen.queryByText(/required/i)).not.toBeInTheDocument();
    });

    it('sets aria-invalid when status type is error', () => {
      render(
        <TextArea
          label="Description"
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
        <TextArea
          label="Description"
          value=""
          onChange={() => {}}
          status={{type: 'warning'}}
        />,
      );
      expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-invalid');
    });

    it('does not set aria-invalid for success status', () => {
      render(
        <TextArea
          label="Description"
          value=""
          onChange={() => {}}
          status={{type: 'success'}}
        />,
      );
      expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-invalid');
    });

    it('includes status message in aria-describedby', () => {
      render(
        <TextArea
          label="Description"
          value=""
          onChange={() => {}}
          status={{type: 'error', message: 'Too short'}}
        />,
      );
      const textarea = screen.getByRole('textbox');
      const describedBy = textarea.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();
      // The status message should be reachable via the described-by ID
      const messageElement = screen.getByText('Too short');
      expect(messageElement).toHaveAttribute('id');
      expect(describedBy).toContain(messageElement.id);
    });

    it('shows both the loading spinner and the status icon while busy', () => {
      const {container} = render(
        <TextArea
          label="Description"
          value=""
          onChange={() => {}}
          isLoading
          status={{type: 'error'}}
        />,
      );
      // Matches the other inputs: spinner (role="status") and the status icon
      // render side by side in the end slot, not mutually exclusively.
      expectSilentBusySpinner();
      // Status icon svg is also present alongside the spinner.
      expect(container.querySelectorAll('svg').length).toBeGreaterThan(0);
    });
  });

  it('renders tooltip info icon when labelTooltip is provided', () => {
    render(
      <TextArea
        label="Description"
        value=""
        onChange={() => {}}
        labelTooltip="Enter a detailed description"
      />,
    );
    // Info icon should be present
    expect(document.querySelector('svg')).toBeInTheDocument();
  });

  it('does not render tooltip icon when labelTooltip is not provided', () => {
    render(<TextArea label="Description" value="" onChange={() => {}} />);
    expect(document.querySelector('svg')).not.toBeInTheDocument();
  });

  it('renders with size="lg"', () => {
    render(
      <TextArea label="Description" value="" onChange={() => {}} size="lg" />,
    );
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
  });

  describe('hasSpellCheck prop', () => {
    it('enables spellcheck by default', () => {
      render(<TextArea label="Description" value="" onChange={() => {}} />);
      expect(screen.getByRole('textbox')).toHaveAttribute('spellcheck', 'true');
    });

    it('enables spellcheck when hasSpellCheck is true', () => {
      render(
        <TextArea
          label="Description"
          value=""
          onChange={() => {}}
          hasSpellCheck={true}
        />,
      );
      expect(screen.getByRole('textbox')).toHaveAttribute('spellcheck', 'true');
    });

    it('disables spellcheck when hasSpellCheck is false', () => {
      render(
        <TextArea
          label="Description"
          value=""
          onChange={() => {}}
          hasSpellCheck={false}
        />,
      );
      expect(screen.getByRole('textbox')).toHaveAttribute(
        'spellcheck',
        'false',
      );
    });
  });

  describe('onPaste prop', () => {
    it('calls onPaste when content is pasted', () => {
      const handlePaste = vi.fn();
      render(
        <TextArea
          label="Description"
          value=""
          onChange={() => {}}
          onPaste={handlePaste}
        />,
      );

      const textarea = screen.getByRole('textbox');
      fireEvent.paste(textarea, {
        clipboardData: {getData: () => 'pasted text'},
      });
      expect(handlePaste).toHaveBeenCalledTimes(1);
    });

    it('does not throw when onPaste is not provided', () => {
      render(<TextArea label="Description" value="" onChange={() => {}} />);

      const textarea = screen.getByRole('textbox');
      expect(() => {
        fireEvent.paste(textarea, {
          clipboardData: {getData: () => 'pasted text'},
        });
      }).not.toThrow();
    });
  });

  describe('maxLength prop', () => {
    it('displays character counter when maxLength is provided', () => {
      render(
        <TextArea
          label="Description"
          value="Hello"
          onChange={() => {}}
          maxLength={20}
        />,
      );
      expect(screen.getByText('5/20')).toBeInTheDocument();
    });

    it('does not display counter when maxLength is not provided', () => {
      render(
        <TextArea label="Description" value="Hello" onChange={() => {}} />,
      );
      expect(screen.queryByText(/\/\d+/)).not.toBeInTheDocument();
    });

    it('updates counter as value changes', () => {
      const {rerender} = render(
        <TextArea
          label="Description"
          value=""
          onChange={() => {}}
          maxLength={100}
        />,
      );
      expect(screen.getByText('0/100')).toBeInTheDocument();

      rerender(
        <TextArea
          label="Description"
          value="Hello World"
          onChange={() => {}}
          maxLength={100}
        />,
      );
      expect(screen.getByText('11/100')).toBeInTheDocument();
    });

    it('does not set native maxLength attribute (counter is visual-only)', () => {
      render(
        <TextArea
          label="Description"
          value=""
          onChange={() => {}}
          maxLength={50}
        />,
      );
      expect(screen.getByRole('textbox')).not.toHaveAttribute('maxlength');
      expect(screen.getByText('0/50')).toBeInTheDocument();
    });

    it('does not set maxLength attribute when not provided', () => {
      render(<TextArea label="Description" value="" onChange={() => {}} />);
      expect(screen.getByRole('textbox')).not.toHaveAttribute('maxlength');
    });

    it('counts user-perceived characters, not code units (#4759)', () => {
      // Two surrogate-pair emoji: 4 code units, but 2 user-perceived characters.
      render(
        <TextArea
          label="Description"
          value={'\u{1F600}\u{1F600}'}
          onChange={() => {}}
          maxLength={5}
        />,
      );
      expect(screen.getByText('2/5')).toBeInTheDocument();
    });

    it('measures the over-limit state in characters (#4759)', () => {
      // Three ZWJ family emoji: 33 code units, 3 user-perceived characters.
      const family = '\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}';
      render(
        <TextArea
          label="Description"
          value={family.repeat(3)}
          onChange={() => {}}
          maxLength={2}
        />,
      );
      expect(screen.getByText('3/2')).toBeInTheDocument();
    });

    it('counter updates as user types (controlled)', async () => {
      const user = userEvent.setup();
      function Wrapper() {
        const [val, setVal] = useState('');
        return (
          <TextArea
            label="Description"
            value={val}
            onChange={setVal}
            maxLength={50}
          />
        );
      }
      render(<Wrapper />);
      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Hello');
      expect(screen.getByText('5/50')).toBeInTheDocument();
    });

    it('announces remaining characters politely as the value nears the limit', async () => {
      const user = userEvent.setup();
      function Wrapper() {
        const [val, setVal] = useState('x'.repeat(44));
        return (
          <TextArea
            label="Description"
            value={val}
            onChange={setVal}
            maxLength={50}
          />
        );
      }
      render(<Wrapper />);
      // Type one more char to cross into the "near the limit" zone (45/50).
      await user.type(screen.getByRole('textbox'), 'x');
      const politeRegion = () =>
        document.querySelector('[data-astryx-live-region="polite"]');
      await waitFor(() => {
        expect(politeRegion()).toHaveTextContent('5 characters remaining');
      });
    });

    it('announces over-limit assertively once the value exceeds the max', async () => {
      const user = userEvent.setup();
      function Wrapper() {
        const [val, setVal] = useState('x'.repeat(50));
        return (
          <TextArea
            label="Description"
            value={val}
            onChange={setVal}
            maxLength={50}
          />
        );
      }
      render(<Wrapper />);
      await user.type(screen.getByRole('textbox'), 'x');
      const assertiveRegion = () =>
        document.querySelector('[data-astryx-live-region="assertive"]');
      await waitFor(() => {
        expect(assertiveRegion()).toHaveTextContent(
          '1 character over the limit',
        );
      });
    });

    it('announces zone transitions using character counts (#4759)', async () => {
      function Wrapper() {
        const [val, setVal] = useState('x'.repeat(7));
        return (
          <TextArea
            label="Description"
            value={val}
            onChange={setVal}
            maxLength={10}
          />
        );
      }
      render(<Wrapper />);
      // Appending two emoji makes 9 characters (11 code units): near the limit
      // with 1 remaining. Code-unit counting would call this over the limit
      // and announce assertively instead.
      fireEvent.change(screen.getByRole('textbox'), {
        target: {value: 'x'.repeat(7) + '\u{1F600}\u{1F600}'},
      });
      const politeRegion = () =>
        document.querySelector('[data-astryx-live-region="polite"]');
      const assertiveRegion = () =>
        document.querySelector('[data-astryx-live-region="assertive"]');
      await waitFor(() => {
        expect(politeRegion()).toHaveTextContent('1 character remaining');
      });
      expect(assertiveRegion()).not.toHaveTextContent('over the limit');
    });

    it('does not flag over-limit while characters fit, even when code units exceed (#4759)', () => {
      // Three emoji: 6 code units but 3 user-perceived characters — within a
      // maxLength of 4, so no error state anywhere.
      render(
        <TextArea
          label="Description"
          value={'\u{1F600}'.repeat(3)}
          onChange={() => {}}
          maxLength={4}
        />,
      );
      const counter = screen.getByText('3/4');
      expect(counter.querySelector('svg')).toBeNull();
      expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-invalid');
    });

    it('shows a non-color over-limit indicator icon when exceeded', () => {
      const {container} = render(
        <TextArea
          label="Description"
          value={'x'.repeat(55)}
          onChange={() => {}}
          maxLength={50}
        />,
      );
      // The counter renders a warning icon (a shape cue) alongside the red
      // count, so the over-limit state is not conveyed by color alone.
      const counter = screen.getByText('55/50').closest('div');
      expect(counter?.querySelector('svg')).toBeInTheDocument();
      expect(container).toBeInTheDocument();
    });

    it('does not show the over-limit indicator icon within the limit', () => {
      render(
        <TextArea
          label="Description"
          value={'x'.repeat(45)}
          onChange={() => {}}
          maxLength={50}
        />,
      );
      const counter = screen.getByText('45/50').closest('div');
      expect(counter?.querySelector('svg')).not.toBeInTheDocument();
    });

    it('counter is linked to textarea via aria-describedby', () => {
      render(
        <TextArea
          label="Description"
          value="Hello"
          onChange={() => {}}
          maxLength={50}
        />,
      );
      const textarea = screen.getByRole('textbox');
      const describedBy = textarea.getAttribute('aria-describedby');
      const counter = screen.getByText('5/50');
      expect(counter).toHaveAttribute('id');
      expect(describedBy).toContain(counter.id);
    });

    it('renders the counter inside the input container (same wrapper as textarea)', () => {
      render(
        <TextArea
          label="Description"
          value="Hello"
          onChange={() => {}}
          maxLength={50}
        />,
      );
      const textarea = screen.getByRole('textbox');
      const counter = screen.getByText('5/50');
      // The counter now lives inside the bordered input container as a sibling
      // overlay of the textarea, not below it as an out-of-container element.
      expect(textarea.parentElement).toBe(counter.parentElement);
    });
  });

  describe('hasAutoFocus prop', () => {
    it('sets autofocus attribute when hasAutoFocus is true', () => {
      render(
        <TextArea
          label="Description"
          value=""
          onChange={() => {}}
          hasAutoFocus
        />,
      );
      expect(screen.getByRole('textbox')).toHaveFocus();
    });

    it('does not set autofocus when hasAutoFocus is false', () => {
      render(<TextArea label="Description" value="" onChange={() => {}} />);
      expect(screen.getByRole('textbox')).not.toHaveFocus();
    });
  });

  describe('htmlName prop', () => {
    it('sets name attribute when htmlName is provided', () => {
      render(
        <TextArea
          label="Description"
          value=""
          onChange={() => {}}
          htmlName="description"
        />,
      );
      expect(screen.getByRole('textbox')).toHaveAttribute(
        'name',
        'description',
      );
    });

    it('does not set name attribute when htmlName is not provided', () => {
      render(<TextArea label="Description" value="" onChange={() => {}} />);
      expect(screen.getByRole('textbox')).not.toHaveAttribute('name');
    });
  });

  describe('form participation', () => {
    it('submits the value under htmlName', () => {
      const {container} = render(
        <form>
          <TextArea
            label="Notes"
            htmlName="notes"
            value="hello"
            onChange={() => {}}
          />
        </form>,
      );
      const data = new FormData(container.querySelector('form')!);
      expect(data.get('notes')).toBe('hello');
    });

    it('is excluded from form data when disabled', () => {
      const {container} = render(
        <form>
          <TextArea
            label="Notes"
            htmlName="notes"
            value="hello"
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
          <TextArea
            label="Notes"
            htmlName="notes"
            value="hello"
            onChange={() => {}}
            isDisabled
            disabledMessage="Notes are locked while the review is open"
          />
        </form>,
      );
      expect([
        ...new FormData(container.querySelector('form')!).keys(),
      ]).toEqual([]);
    });
  });

  describe('isReadOnly', () => {
    it('marks the textarea read-only', () => {
      render(
        <TextArea label="Notes" value="hello" onChange={() => {}} isReadOnly />,
      );
      expect(screen.getByRole('textbox')).toHaveAttribute('readonly');
    });

    it('still submits its value with the form', () => {
      const {container} = render(
        <form>
          <TextArea
            label="Notes"
            htmlName="notes"
            value="hello"
            onChange={() => {}}
            isReadOnly
          />
        </form>,
      );
      expect(new FormData(container.querySelector('form')!).get('notes')).toBe(
        'hello',
      );
    });

    it('does not call onChange when the user types', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      render(
        <TextArea
          label="Notes"
          value="hello"
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
        <TextArea label="Notes" value="hello" onChange={() => {}} isReadOnly />,
      );
      const textarea = screen.getByRole('textbox');
      expect(textarea).not.toBeDisabled();
      await user.tab();
      expect(textarea).toHaveFocus();
    });

    it('lets isDisabled win when both are set', () => {
      const {container} = render(
        <form>
          <TextArea
            label="Notes"
            htmlName="notes"
            value="hello"
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
    it('forwards autoComplete to the native textarea unchanged', () => {
      render(
        <TextArea
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
      render(<TextArea label="Description" value="" onChange={() => {}} />);
      expect(screen.getByRole('textbox')).not.toHaveAttribute('autocomplete');
    });
  });

  describe('click-to-focus', () => {
    it('focuses textarea when clicking the start icon', () => {
      render(
        <TextArea
          label="Notes"
          value=""
          onChange={() => {}}
          startIcon={<TestIcon />}
        />,
      );

      const textarea = screen.getByRole('textbox');
      const wrapper = textarea.parentElement!;
      const iconElement = wrapper.querySelector('svg')!;

      fireEvent.click(iconElement);
      expect(textarea).toHaveFocus();
    });

    it('focuses textarea when clicking the wrapper padding', () => {
      render(<TextArea label="Notes" value="" onChange={() => {}} />);

      const textarea = screen.getByRole('textbox');
      const wrapper = textarea.parentElement!;

      fireEvent.click(wrapper);
      expect(textarea).toHaveFocus();
    });
  });

  describe('disabledMessage', () => {
    it('shows the reason tooltip on hover when disabled with a reason', async () => {
      render(
        <TextArea
          label="Notes"
          value=""
          onChange={() => {}}
          isDisabled
          disabledMessage="You need the Editor role"
        />,
      );

      const textarea = screen.getByRole('textbox');
      const container = textarea.parentElement as HTMLElement;
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
        <TextArea
          label="Notes"
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
        <TextArea
          label="Notes"
          value=""
          onChange={() => {}}
          disabledMessage="You need the Editor role"
        />,
      );
      expect(screen.queryByRole('tooltip', h)).not.toBeInTheDocument();
    });

    it('does not render a tooltip when disabled without a reason', () => {
      render(
        <TextArea label="Notes" value="" onChange={() => {}} isDisabled />,
      );
      expect(screen.queryByRole('tooltip', h)).not.toBeInTheDocument();
    });

    it('keeps the textarea focusable via aria-disabled when a reason is provided', () => {
      render(
        <TextArea
          label="Notes"
          value=""
          onChange={() => {}}
          isDisabled
          disabledMessage="You need the Editor role"
        />,
      );
      const textarea = screen.getByRole('textbox');
      expect(textarea).not.toBeDisabled();
      expect(textarea).toHaveAttribute('aria-disabled', 'true');
      expect(textarea).toHaveAttribute('readonly');
    });

    it('links the reason tooltip from the textarea via aria-describedby', () => {
      render(
        <TextArea
          label="Notes"
          value=""
          onChange={() => {}}
          isDisabled
          disabledMessage="You need the Editor role"
        />,
      );
      const textarea = screen.getByRole('textbox');
      const tooltip = screen.getByRole('tooltip', h);
      expect(textarea.getAttribute('aria-describedby')).toContain(tooltip.id);
    });

    it('blocks value changes while focusable-disabled', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <TextArea
          label="Notes"
          value=""
          onChange={onChange}
          isDisabled
          disabledMessage="You need the Editor role"
        />,
      );

      const textarea = screen.getByRole('textbox');
      await user.click(textarea);
      await user.keyboard('hello');
      expect(onChange).not.toHaveBeenCalled();
      expect(textarea).toHaveValue('');
    });

    it('stays focusable when disabled without a reason', () => {
      render(
        <TextArea label="Notes" value="" onChange={() => {}} isDisabled />,
      );
      const textarea = screen.getByRole('textbox');
      expect(textarea).not.toBeDisabled();
      expect(textarea).toHaveAttribute('aria-disabled', 'true');
    });
  });
});

describe('TextArea statusVariant forwarding', () => {
  it('defaults to attached (status renders with data-variant="attached")', () => {
    const {container} = render(
      <TextArea
        label="Bio"
        value=""
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
      <TextArea
        label="Bio"
        value=""
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

  it('reserves trailing space for the on-field icon with the default (attached) status', () => {
    // Attached renders the on-field status icon, so the textarea must inset its
    // trailing edge to clear it.
    render(
      <TextArea
        label="Bio"
        value=""
        onChange={() => {}}
        status={{type: 'error', message: 'Required'}}
      />,
    );
    // The on-field status glyph renders (in the end slot).
    expect(document.querySelector('.astryx-input-status-icon')).not.toBeNull();
  });

  it('does not render an on-field icon for statusVariant="detached", and does not reserve trailing space for it', () => {
    // The detached variant suppresses the on-field icon (its glyph lives in the
    // message box below), so the textarea must NOT inset its trailing edge —
    // otherwise the text is pushed in for an icon that never appears.
    const attached = render(
      <TextArea
        label="Bio"
        value=""
        onChange={() => {}}
        status={{type: 'error', message: 'Required'}}
        statusVariant="attached"
      />,
    );
    const attachedTextarea = attached.getByRole('textbox');
    const attachedClasses = new Set(attachedTextarea.className.split(/\s+/));
    attached.unmount();

    const detached = render(
      <TextArea
        label="Bio"
        value=""
        onChange={() => {}}
        status={{type: 'error', message: 'Required'}}
        statusVariant="detached"
      />,
    );
    // No on-field icon is rendered for detached.
    expect(document.querySelector('.astryx-input-status-icon')).toBeNull();

    const detachedTextarea = detached.getByRole('textbox');
    const detachedClasses = new Set(detachedTextarea.className.split(/\s+/));

    // The attached textarea carries exactly one extra StyleX class over the
    // detached one: the trailing-reserve style. Detached must not carry it, so
    // its class set is a strict subset of attached's.
    for (const cls of detachedClasses) {
      expect(attachedClasses.has(cls)).toBe(true);
    }
    expect(detachedClasses.size).toBeLessThan(attachedClasses.size);
  });
});

describe('TextArea disabled theme state', () => {
  it('reflects disabled on the root target so themes can gate paint on it', () => {
    const {container} = render(
      <TextArea label="Description" value="" onChange={() => {}} isDisabled />,
    );
    const root = container.querySelector('.astryx-text-area');
    expect(root).toHaveAttribute('data-disabled', 'disabled');
  });

  it('omits data-disabled when enabled, like status does', () => {
    const {container} = render(
      <TextArea label="Description" value="" onChange={() => {}} />,
    );
    const root = container.querySelector('.astryx-text-area');
    expect(root).not.toHaveAttribute('data-disabled');
  });
});

describe('TextArea readonly theme state', () => {
  it('reflects readonly on the root target so themes can gate paint on it', () => {
    const {container} = render(
      <TextArea label="Notes" value="" onChange={() => {}} isReadOnly />,
    );
    const root = container.querySelector('.astryx-text-area');
    expect(root).toHaveAttribute('data-readonly', 'readonly');
  });

  it('omits data-readonly when editable', () => {
    const {container} = render(
      <TextArea label="Notes" value="" onChange={() => {}} />,
    );
    const root = container.querySelector('.astryx-text-area');
    expect(root).not.toHaveAttribute('data-readonly');
  });
});

describe('TextArea theme target names', () => {
  it('renders only the canonical target class', () => {
    const {container} = render(
      <TextArea label="Notes" value="" onChange={() => {}} />,
    );
    const root = container.querySelector('.astryx-text-area');
    expect(root).not.toBeNull();
    expect(root).toHaveClass('astryx-text-area');
    expect(root).not.toHaveClass('astryx-textarea');
  });
});
