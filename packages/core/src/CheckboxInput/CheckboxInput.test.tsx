// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CheckboxInput.test.tsx
 * @input Uses vitest, @testing-library/react, CheckboxInput component
 * @output Unit tests for CheckboxInput-specific API, callback, form,
 *   composition, and styling behavior. Shared checkbox semantics live in
 *   __tests__/Checkbox.a11y.test.tsx and its Chromium twin.
 * @position Component-owned regression tests; validates CheckboxInput.tsx without
 *   duplicating outcomes owned by the reusable checkbox contract.
 *
 * SYNC: When CheckboxInput.tsx changes, update tests to match new behavior
 */

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {render, screen, fireEvent, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  hasPressedArm,
  hasReleaseFade,
  readsPressStrength,
} from '../__tests__/pressState';
import {CheckboxInput} from './CheckboxInput';
import {Theme} from '../theme/Theme';
import {defineTheme} from '../theme/defineTheme';
import {getForcedColorsRules} from '../__tests__/forcedColors';
import {__resetLiveRegionsForTest} from '../hooks/useAnnounce';
import {FOCUS_OUTLINE_PARTS} from '../utils/focusOutline.stylex';

interface InjectedRule {
  selector: string;
  text: string;
  media: string | null;
}

function injectedRules(): InjectedRule[] {
  const walk = (rules: CSSRuleList, condition: string | null): InjectedRule[] =>
    [...rules].flatMap((rule): InjectedRule[] => {
      const {selectorText} = rule as CSSStyleRule;
      if (typeof selectorText === 'string') {
        return [{selector: selectorText, text: rule.cssText, media: condition}];
      }
      const nested = (rule as CSSGroupingRule).cssRules;
      if (nested == null) {
        return [];
      }
      const own = (rule as CSSMediaRule).media?.mediaText;
      return walk(nested, own != null && own !== '' ? own : condition);
    });

  return [...document.styleSheets].flatMap(sheet => walk(sheet.cssRules, null));
}

afterEach(() => {
  __resetLiveRegionsForTest();
});

// Mock showPopover/hidePopover (not implemented in jsdom) so the tooltip layer
// reflects its open state via a `popover-open` attribute the tests can assert.
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

describe('CheckboxInput', () => {
  it('calls onChange with new checked state when clicked', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <CheckboxInput
        label="Accept terms"
        value={false}
        onChange={handleChange}
      />,
    );

    const checkbox = screen.getByRole('checkbox');
    await user.click(checkbox);
    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith(true, expect.any(Object));
  });

  it('calls onChange with false when unchecking', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <CheckboxInput
        label="Accept terms"
        value={true}
        onChange={handleChange}
      />,
    );

    const checkbox = screen.getByRole('checkbox');
    await user.click(checkbox);
    expect(handleChange).toHaveBeenCalledWith(false, expect.any(Object));
  });

  it('keeps a changeAction-only checkbox editable', async () => {
    const user = userEvent.setup();
    const changeAction = vi.fn();
    render(
      <CheckboxInput
        label="Accept terms"
        value={false}
        changeAction={changeAction}
      />,
    );

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toHaveAttribute('aria-readonly');
    await user.click(checkbox);
    await waitFor(() =>
      expect(changeAction).toHaveBeenCalledWith(true, expect.any(Object)),
    );
  });

  it('works when clicking on the label', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <CheckboxInput
        label="Accept terms"
        value={false}
        onChange={handleChange}
      />,
    );

    const label = screen.getByText('Accept terms');
    await user.click(label);
    expect(handleChange).toHaveBeenCalledWith(true, expect.any(Object));
  });

  it('renders description when provided', () => {
    render(
      <CheckboxInput
        label="Subscribe"
        description="Receive weekly updates"
        value={false}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('Receive weekly updates')).toBeInTheDocument();
  });

  it('toggles when clicking on the description', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <CheckboxInput
        label="Subscribe"
        description="Receive weekly updates"
        value={false}
        onChange={handleChange}
      />,
    );
    await user.click(screen.getByText('Receive weekly updates'));
    expect(handleChange).toHaveBeenCalledWith(true, expect.any(Object));
  });

  it('does not call onChange when isDisabled', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <CheckboxInput
        label="Accept terms"
        value={false}
        onChange={handleChange}
        isDisabled
      />,
    );

    const checkbox = screen.getByRole('checkbox');
    await user.click(checkbox);
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('forwards data-testid to the input', () => {
    render(
      <CheckboxInput
        label="Accept terms"
        value={false}
        onChange={() => {}}
        data-testid="accept-terms-checkbox"
      />,
    );
    expect(screen.getByTestId('accept-terms-checkbox')).toBe(
      screen.getByRole('checkbox'),
    );
  });

  it('preserves a caller-provided id on the input and its label', () => {
    render(
      <CheckboxInput
        id="accept-terms"
        label="Accept terms"
        value={false}
        onChange={() => {}}
      />,
    );

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveAttribute('id', 'accept-terms');
    expect(screen.getByText('Accept terms').closest('label')).toHaveAttribute(
      'for',
      'accept-terms',
    );
    expect(screen.getByLabelText('Accept terms')).toBe(checkbox);
  });

  it('generates an id the label resolves when the caller passes an empty id', () => {
    render(
      <CheckboxInput
        id=""
        label="Accept terms"
        value={false}
        onChange={() => {}}
      />,
    );

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox.id).not.toBe('');
    expect(screen.getByLabelText('Accept terms')).toBe(checkbox);
  });

  it('forwards arbitrary data-* attributes to the input', () => {
    render(
      <CheckboxInput
        label="Accept terms"
        value={false}
        onChange={() => {}}
        data-tracking-id="checkbox-42"
      />,
    );
    expect(screen.getByRole('checkbox')).toHaveAttribute(
      'data-tracking-id',
      'checkbox-42',
    );
  });

  it('does not let rest props override checked, disabled, or type', () => {
    // Not part of CheckboxInputProps; spread (rather than named attributes)
    // to sidestep JSX excess-property checks the same way a real caller's
    // spread rest-props object would arrive untyped at runtime.
    const foreignAttrs: Record<string, unknown> = {
      checked: false,
      disabled: false,
      type: 'text',
    };
    render(
      <CheckboxInput
        {...foreignAttrs}
        label="Accept terms"
        value={true}
        onChange={() => {}}
        isDisabled
      />,
    );
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeChecked();
    expect(checkbox).toHaveAttribute('aria-disabled', 'true');
    expect(checkbox).toHaveAttribute('type', 'checkbox');
  });

  it('forwards ref correctly', () => {
    const ref = vi.fn();
    render(
      <CheckboxInput
        ref={ref}
        label="Accept terms"
        value={false}
        onChange={() => {}}
      />,
    );
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLInputElement));
  });

  it('visually hides label when isLabelHidden is true', () => {
    render(
      <CheckboxInput
        label="Select row"
        isLabelHidden
        value={false}
        onChange={() => {}}
      />,
    );
    const label = screen.getByText('Select row');
    expect(label).toBeInTheDocument();
    // Label should still be accessible
    expect(screen.getByLabelText('Select row')).toBeInTheDocument();
  });

  it('keeps description linked via aria-describedby when isLabelHidden', () => {
    render(
      <CheckboxInput
        label="Select row"
        isLabelHidden
        description="Selects this row for bulk actions"
        value={false}
        onChange={() => {}}
      />,
    );
    const checkbox = screen.getByRole('checkbox');
    const description = screen.getByText('Selects this row for bulk actions');
    expect(description.id).not.toBe('');
    expect(checkbox.getAttribute('aria-describedby')).toContain(description.id);
  });

  it('merges a consumer aria-describedby with its own description id', () => {
    render(
      <>
        <span id="row-hint">Hint from the row</span>
        <CheckboxInput
          label="Select row"
          isLabelHidden
          description="Selects this row for bulk actions"
          aria-describedby="row-hint"
          value={false}
          onChange={() => {}}
        />
      </>,
    );
    const checkbox = screen.getByRole('checkbox');
    const description = screen.getByText('Selects this row for bulk actions');
    const ids = checkbox.getAttribute('aria-describedby')!.split(' ');
    expect(ids).toContain('row-hint');
    expect(ids).toContain(description.id);
  });

  it('shows label visually by default', () => {
    render(
      <CheckboxInput label="Accept terms" value={false} onChange={() => {}} />,
    );
    const label = screen.getByText('Accept terms');
    expect(label).toBeVisible();
  });

  it('sets aria-busy when loading', () => {
    render(
      <CheckboxInput
        label="Accept terms"
        value={false}
        onChange={() => {}}
        isLoading
      />,
    );
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-busy', 'true');
  });

  it('exposes indeterminate state via the native indeterminate property', () => {
    render(
      <CheckboxInput
        label="Select all"
        value="indeterminate"
        onChange={() => {}}
      />,
    );
    const checkbox = screen.getByRole('checkbox');
    // Native checkboxes expose mixed state through the DOM indeterminate
    // property, which browsers map to aria-checked="mixed". A redundant
    // aria-checked attribute is intentionally NOT set (forms-16).
    expect(checkbox).toBeInstanceOf(HTMLInputElement);
    if (checkbox instanceof HTMLInputElement) {
      expect(checkbox.indeterminate).toBe(true);
    }
    expect(checkbox).not.toHaveAttribute('aria-checked');
  });

  it('renders semantic labelIcon names as icons', () => {
    const {container} = render(
      <CheckboxInput
        label="Accept terms"
        value={false}
        onChange={() => {}}
        labelIcon="info"
      />,
    );

    expect(container.textContent).toBe('Accept terms');
    expect(container.querySelector('.astryx-icon')).toBeInTheDocument();
  });

  it('renders custom labelIcon content', () => {
    render(
      <CheckboxInput
        label="Accept terms"
        value={false}
        onChange={() => {}}
        labelIcon={<span data-testid="custom-label-icon">Custom</span>}
      />,
    );

    expect(screen.getByTestId('custom-label-icon')).toHaveTextContent('Custom');
  });

  it('renders the status message for an error', () => {
    render(
      <CheckboxInput
        label="Accept terms"
        value={false}
        onChange={() => {}}
        status={{type: 'error', message: 'Required field'}}
      />,
    );
    expect(screen.getByText('Required field')).toBeInTheDocument();
  });

  // Regression: the status is conditionally mounted, so it must be announced
  // through the persistent useAnnounce live region — a live region born
  // together with its content is not reliably announced.
  it('announces a status message that appears after mount', async () => {
    const {rerender} = render(
      <CheckboxInput label="Accept terms" value={false} onChange={() => {}} />,
    );
    expect(
      document.querySelector('[data-astryx-live-region="assertive"]'),
    ).toBeNull();

    rerender(
      <CheckboxInput
        label="Accept terms"
        value={false}
        onChange={() => {}}
        status={{type: 'error', message: 'Required field'}}
      />,
    );
    await waitFor(() => {
      expect(
        document.querySelector('[data-astryx-live-region="assertive"]'),
      ).toHaveTextContent('Required field');
    });
  });

  describe('disabledMessage', () => {
    const h = {hidden: true} as const;

    function getRow(): HTMLElement {
      return screen.getByRole('checkbox', h).closest('div')!.parentElement!;
    }

    it('shows the reason tooltip on hover when disabled with a reason', async () => {
      render(
        <CheckboxInput
          label="Accept terms"
          value={false}
          onChange={() => {}}
          isDisabled
          disabledMessage="Terms are managed by your administrator"
        />,
      );
      const tooltip = screen.getByRole('tooltip', h);
      expect(tooltip).toHaveTextContent(
        'Terms are managed by your administrator',
      );
      fireEvent.mouseEnter(getRow());
      await waitFor(() => expect(tooltip).toHaveAttribute('popover-open'));
      fireEvent.mouseLeave(getRow());
      await waitFor(() => expect(tooltip).not.toHaveAttribute('popover-open'));
    });

    it('shows the reason tooltip on keyboard focus', async () => {
      const user = userEvent.setup();
      render(
        <CheckboxInput
          label="Accept terms"
          value={false}
          onChange={() => {}}
          isDisabled
          disabledMessage="Terms are managed by your administrator"
        />,
      );
      const tooltip = screen.getByRole('tooltip', h);
      await user.tab();
      expect(screen.getByRole('checkbox', h)).toHaveFocus();
      await waitFor(() => expect(tooltip).toHaveAttribute('popover-open'));
    });

    it('does not render a tooltip when not disabled', () => {
      render(
        <CheckboxInput
          label="Accept terms"
          value={false}
          onChange={() => {}}
          disabledMessage="Terms are managed by your administrator"
        />,
      );
      expect(screen.queryByRole('tooltip', h)).not.toBeInTheDocument();
    });

    it('keeps a consumer aria-describedby alongside the reason tooltip', () => {
      render(
        <>
          <span id="terms-hint">Required before checkout</span>
          <CheckboxInput
            label="Accept terms"
            value={false}
            onChange={() => {}}
            isDisabled
            disabledMessage="Terms are managed by your administrator"
            aria-describedby="terms-hint"
          />
        </>,
      );
      const checkbox = screen.getByRole('checkbox');
      const tooltip = screen.getByRole('tooltip', h);
      const ids = checkbox.getAttribute('aria-describedby')!.split(' ');
      expect(ids).toContain('terms-hint');
      expect(ids).toContain(tooltip.id);
    });

    it('does not render a tooltip when disabled without a reason', () => {
      render(
        <CheckboxInput
          label="Accept terms"
          value={false}
          onChange={() => {}}
          isDisabled
        />,
      );
      expect(screen.queryByRole('tooltip', h)).not.toBeInTheDocument();
    });

    it('keeps the checkbox focusable via aria-disabled when a reason is provided', () => {
      render(
        <CheckboxInput
          label="Accept terms"
          value={false}
          onChange={() => {}}
          isDisabled
          disabledMessage="Terms are managed by your administrator"
        />,
      );
      const checkbox = screen.getByRole('checkbox', h);
      expect(checkbox).not.toBeDisabled();
      expect(checkbox).toHaveAttribute('aria-disabled', 'true');
    });

    it('links the reason tooltip via aria-describedby', () => {
      render(
        <CheckboxInput
          label="Accept terms"
          value={false}
          onChange={() => {}}
          isDisabled
          disabledMessage="Terms are managed by your administrator"
        />,
      );
      const checkbox = screen.getByRole('checkbox', h);
      const tooltip = screen.getByRole('tooltip', h);
      expect(checkbox.getAttribute('aria-describedby')).toContain(tooltip.id);
    });

    it('blocks toggling while focusable-disabled', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <CheckboxInput
          label="Accept terms"
          value={false}
          onChange={onChange}
          isDisabled
          disabledMessage="Terms are managed by your administrator"
        />,
      );
      const checkbox = screen.getByRole('checkbox', h);
      await user.click(checkbox);
      expect(onChange).not.toHaveBeenCalled();
      expect(checkbox).not.toBeChecked();
    });

    it('stays focusable via aria-disabled when disabled without a reason', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      const onClick = vi.fn();
      render(
        <form>
          <CheckboxInput
            label="Accept terms"
            value={false}
            onChange={onChange}
            onClick={onClick}
            htmlName="terms"
            isRequired
            isDisabled
          />
        </form>,
      );
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).not.toHaveAttribute('disabled');
      expect(checkbox).toHaveAttribute('aria-disabled', 'true');
      await user.tab();
      expect(checkbox).toHaveFocus();
      await user.keyboard(' ');
      await user.click(checkbox);
      expect(onChange).not.toHaveBeenCalled();
      expect(onClick).not.toHaveBeenCalled();
      expect(checkbox).not.toBeChecked();
      const form = checkbox.closest('form')!;
      expect(form.checkValidity()).toBe(true);
      expect([...new FormData(form).keys()]).toEqual([]);
    });

    it('keeps a disabled indeterminate checkbox mixed after Space or a click', async () => {
      const user = userEvent.setup();
      render(
        <CheckboxInput
          label="Select all"
          value="indeterminate"
          onChange={() => {}}
          isDisabled
        />,
      );
      const checkbox = screen.getByRole<HTMLInputElement>('checkbox');
      expect(checkbox.indeterminate).toBe(true);
      await user.tab();
      await user.keyboard(' ');
      fireEvent.click(checkbox);
      expect(checkbox.indeterminate).toBe(true);
      expect(checkbox).not.toBeChecked();
    });
  });
  describe('form participation', () => {
    it('submits under htmlName when checked', () => {
      const {container} = render(
        <form>
          <CheckboxInput
            label="Terms"
            htmlName="terms"
            value={true}
            onChange={() => {}}
          />
        </form>,
      );
      const data = new FormData(container.querySelector('form')!);
      expect(data.get('terms')).toBe('on');
    });

    it('does not block form submission when required and disabled with a disabledMessage', () => {
      const {container} = render(
        <form>
          <CheckboxInput
            label="Terms"
            htmlName="terms"
            value={false}
            onChange={() => {}}
            isRequired
            isDisabled
            disabledMessage="Terms are managed by your administrator"
          />
        </form>,
      );
      expect(container.querySelector('form')!.checkValidity()).toBe(true);
    });

    it('still blocks submission when required and unchecked but enabled', () => {
      const {container} = render(
        <form>
          <CheckboxInput
            label="Terms"
            htmlName="terms"
            value={false}
            onChange={() => {}}
            isRequired
          />
        </form>,
      );
      expect(container.querySelector('form')!.checkValidity()).toBe(false);
    });

    it('is excluded from form data when disabled, even with a disabledMessage', () => {
      const {container} = render(
        <form>
          <CheckboxInput
            label="Terms"
            htmlName="terms"
            value={true}
            onChange={() => {}}
            isDisabled
            disabledMessage="Locked"
          />
        </form>,
      );
      expect([
        ...new FormData(container.querySelector('form')!).keys(),
      ]).toEqual([]);
    });

    it('submits nothing when unchecked', () => {
      const {container} = render(
        <form>
          <CheckboxInput
            label="Terms"
            htmlName="terms"
            value={false}
            onChange={() => {}}
          />
        </form>,
      );
      expect([
        ...new FormData(container.querySelector('form')!).keys(),
      ]).toEqual([]);
    });
  });

  describe('coarse pointer and RTL hit-target positioning', () => {
    it.each([
      ['sm', 'ltr'],
      ['sm', 'rtl'],
      ['md', 'ltr'],
      ['md', 'rtl'],
    ] as const)(
      'applies centerInline styling to native input (size: %s, dir: %s)',
      (size, dir) => {
        const {container} = render(
          <div dir={dir}>
            <CheckboxInput
              label="Option"
              size={size}
              value={false}
              onChange={() => {}}
            />
          </div>,
        );

        const input = container.querySelector(
          'input[type="checkbox"]',
        ) as HTMLInputElement;
        expect(input).toBeInTheDocument();
        expect(input.className).toContain('centerInline');
      },
    );
  });
});

// jsdom cannot emulate forced-colors rendering, so this asserts that the
// compiled output includes the forced-colors rule; visual behavior needs
// manual verification under Windows High Contrast.
describe('forced colors (WCAG 1.4.11)', () => {
  it('compiles a forced-colors fill so the indeterminate mark survives Windows High Contrast', () => {
    render(
      <CheckboxInput label="All" value="indeterminate" onChange={() => {}} />,
    );
    // The painted indeterminate bar would be stripped to Canvas (invisible);
    // CanvasText keeps it perceivable.
    expect(getForcedColorsRules()).toContain('background-color: canvastext;');
  });

  it('compiles a forced-colors color so the checkmark survives Windows High Contrast', () => {
    render(<CheckboxInput label="Accept" value={true} onChange={() => {}} />);
    // The check strokes with currentColor; forced colors leaves it the same
    // white as the flattened box, so it needs its own CanvasText color to stay
    // perceivable on the Canvas box.
    expect(getForcedColorsRules()).toContain('color: canvastext;');
  });
});

// The control's native input is `opacity: 0`, so the visible focus indicator
// has to land on the indicator beside it — which is themeable, third-party
// code. If drawing the ring were the indicator's job, a replacement that
// simply doesn't would ship a control with no visible focus (WCAG 2.4.7), and
// that is the default: our own sample replacement destructures
// {state, size, isDisabled} and drops the rest.
//
// So the owner paints it, on the indicator's own element, at focus time. The
// shape is right because `outline` follows that element's border-radius, and
// no cooperation is required.
describe('focus ring ownership (WCAG 2.4.7)', () => {
  /** What a theme author plausibly writes: state in, picture out. */
  const BareIndicator = ({state}: {state: string}) => (
    <span aria-hidden="true" data-testid="bare-indicator">
      {state === 'checked' ? 'x' : ''}
    </span>
  );

  const bareTheme = defineTheme({
    name: 'bare-indicator-theme',
    indicators: {checkbox: BareIndicator},
  });

  /**
   * The element the ring is painted on: the indicator slot's only child — the
   * indicator's own root, whatever a theme renders there.
   */
  const indicatorOf = (container: HTMLElement) => {
    const input = container.querySelector('input[type="checkbox"]');
    const slot = input?.nextElementSibling;
    return slot?.firstElementChild as HTMLElement;
  };

  const focusInput = (container: HTMLElement) => {
    const input = container.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;
    // A keydown first, so jsdom's :focus-visible heuristic sees keyboard
    // modality — the ring is deliberately keyboard-only, and a bare
    // fireEvent.focus() reads as a pointer focus. Same approach as the
    // TreeList focus test.
    fireEvent.keyDown(document.body, {key: 'Tab'});
    input.focus();
    fireEvent.focus(input);
    return input;
  };

  it('paints the ring on the built-in indicator', () => {
    const {container} = render(
      <CheckboxInput label="Accept" value={false} onChange={() => {}} />,
    );
    focusInput(container);
    expect(indicatorOf(container).style.outlineStyle).toBe(
      FOCUS_OUTLINE_PARTS.outlineStyle,
    );
  });

  it('paints it on a replacement that forwards nothing', () => {
    const {container} = render(
      <Theme theme={bareTheme}>
        <CheckboxInput label="Accept" value={false} onChange={() => {}} />
      </Theme>,
    );

    // The replacement really took effect, and really is bare.
    const replaced = screen.getByTestId('bare-indicator');
    expect(replaced.className).toBe('');
    // ...and it still gets a ring, because the owner drew it.
    focusInput(container);
    expect(replaced.style.outlineStyle).toBe(FOCUS_OUTLINE_PARTS.outlineStyle);
  });

  it('clears the ring on blur', () => {
    const {container} = render(
      <CheckboxInput label="Accept" value={false} onChange={() => {}} />,
    );
    const input = focusInput(container);
    expect(indicatorOf(container).style.outlineStyle).toBe(
      FOCUS_OUTLINE_PARTS.outlineStyle,
    );
    fireEvent.blur(input);
    expect(indicatorOf(container).style.outlineStyle).toBe('');
  });
});

describe('label theme target', () => {
  it('names its own label so a theme can style it apart from a field label', () => {
    // The control knows this label shares a row with it; the label does not.
    // Both classes land on the one element, so a theme reaches every label
    // through `astryx-field-label` and only this kind through
    // `astryx-checkbox-label`.
    render(
      <CheckboxInput label="Notify me" value={false} onChange={() => {}} />,
    );
    const label = screen.getByText('Notify me').closest('label');
    expect(label).toHaveClass('astryx-field-label');
    expect(label).toHaveClass('astryx-checkbox-label');
  });
});

describe('pressed state', () => {
  it('paints the pressed overlay over the indicator while the row is pressed', () => {
    const {container} = render(
      <CheckboxInput label="Accept terms" value={false} onChange={() => {}} />,
    );
    const box = container.querySelector('.astryx-checkbox-indicator');
    const wrapper = box?.parentElement?.parentElement;
    if (wrapper == null) {
      throw new Error('the checkbox has no indicator wrapper to press');
    }
    // The owner paints over the resolved indicator, so the treatment survives a
    // theme replacement that does not forward style props.
    expect(hasPressedArm(wrapper)).toBe(true);
  });

  it('does not expose a pressed arm on a disabled checkbox', () => {
    const {container} = render(
      <CheckboxInput
        label="Unavailable"
        value={false}
        onChange={() => {}}
        isDisabled
      />,
    );
    const box = container.querySelector('.astryx-checkbox-indicator');
    const wrapper = box?.parentElement?.parentElement;
    if (wrapper == null) {
      throw new Error('the checkbox has no indicator wrapper');
    }
    expect(hasPressedArm(wrapper)).toBe(false);
  });

  it('fades the touch press out from the row, with the overlay reading its strength', () => {
    const {container} = render(
      <CheckboxInput label="Accept terms" value={false} onChange={() => {}} />,
    );
    const box = container.querySelector('.astryx-checkbox-indicator');
    const wrapper = box?.parentElement?.parentElement;
    const row = box?.closest('[data-astryx-pressable]');
    if (wrapper == null || row == null) {
      throw new Error('the checkbox has no pressable row or indicator wrapper');
    }
    // The controller writes the row; the row owns the strength and its
    // release, and the owner-drawn layer over the indicator paints the pressed
    // token at that strength on both touch arms.
    expect(hasReleaseFade(row)).toBe(true);
    expect(readsPressStrength(wrapper, '[data-astryx-press="on"]')).toBe(true);
    expect(readsPressStrength(wrapper)).toBe(true);
  });
});
