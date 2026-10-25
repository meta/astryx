// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file RadioList.test.tsx
 * @input Uses vitest, @testing-library/react, RadioList, RadioListItem
 * @output Component-specific callback, form, composition, layout, and styling
 *   tests. Shared radio-group role, name, state, focus, and interaction outcomes
 *   live in __tests__/RadioGroup.a11y.test.tsx and its Chromium twin.
 * @position Component-owned regression tests that do not duplicate the reusable
 *   radio-group contract.
 *
 * SYNC: When RadioList.tsx or RadioListItem.tsx changes, update tests to match new behavior
 */

import {describe, it, expect, vi, beforeEach} from 'vitest';
import {render, screen, fireEvent, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  hasReleaseFade,
  readsPressStrength,
  rulesDeclaredFor,
  rulesWithSelector,
} from '../__tests__/pressState';
import {RadioList} from './RadioList';
import {RadioListItem} from './RadioListItem';
import {getForcedColorsRules} from '../__tests__/forcedColors';

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

describe('RadioList', () => {
  it('renders with label', () => {
    render(
      <RadioList label="Preference" value="" onChange={() => {}}>
        <RadioListItem label="Option A" value="a" />
      </RadioList>,
    );
    expect(screen.getByText('Preference')).toBeInTheDocument();
  });

  it('renders radio items', () => {
    render(
      <RadioList label="Preference" value="" onChange={() => {}}>
        <RadioListItem label="Option A" value="a" />
        <RadioListItem label="Option B" value="b" />
        <RadioListItem label="Option C" value="c" />
      </RadioList>,
    );
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });

  it('calls onChange with value string when clicking a radio', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <RadioList label="Preference" value="a" onChange={handleChange}>
        <RadioListItem label="Option A" value="a" />
        <RadioListItem label="Option B" value="b" />
      </RadioList>,
    );

    await user.click(screen.getByLabelText('Option B'));
    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith('b');
  });

  it('calls onChange when clicking on a label', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <RadioList label="Preference" value="a" onChange={handleChange}>
        <RadioListItem label="Option A" value="a" />
        <RadioListItem label="Option B" value="b" />
      </RadioList>,
    );

    await user.click(screen.getByText('Option B'));
    expect(handleChange).toHaveBeenCalledWith('b');
  });

  it('calls onChange when clicking the description', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <RadioList label="Preference" value="a" onChange={handleChange}>
        <RadioListItem label="Option A" value="a" description="First option" />
        <RadioListItem label="Option B" value="b" description="Second option" />
      </RadioList>,
    );

    // The whole row delegates surface clicks to the radio, so the description
    // is a live target — not dead space as it was before.
    await user.click(screen.getByText('Second option'));
    expect(handleChange).toHaveBeenCalledWith('b');
  });

  it('does not call onChange when group is disabled', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <RadioList label="Preference" value="" onChange={handleChange} isDisabled>
        <RadioListItem label="Option A" value="a" />
      </RadioList>,
    );

    // userEvent honors `pointer-events: none`, so clicking the disabled row's
    // delegate surface is genuinely blocked (it refuses and throws) rather than
    // merely ignored by the handler — the guarantee this PR's delegation relies
    // on.
    await expect(user.click(screen.getByLabelText('Option A'))).rejects.toThrow(
      /pointer-events/i,
    );
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('does not call onChange when individual item is disabled', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <RadioList label="Preference" value="" onChange={handleChange}>
        <RadioListItem label="Option A" value="a" isDisabled />
      </RadioList>,
    );

    // userEvent honors `pointer-events: none`, so clicking the disabled row's
    // delegate surface is genuinely blocked (it refuses and throws) rather than
    // merely ignored by the handler — the guarantee this PR's delegation relies
    // on.
    await expect(user.click(screen.getByLabelText('Option A'))).rejects.toThrow(
      /pointer-events/i,
    );
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('shows Required indicator when isRequired is true', () => {
    render(
      <RadioList label="Preference" value="" onChange={() => {}} isRequired>
        <RadioListItem label="Option A" value="a" />
      </RadioList>,
    );
    expect(screen.getByText(/Required/)).toBeInTheDocument();
  });

  it('shows Optional indicator when isOptional is true', () => {
    render(
      <RadioList label="Preference" value="" onChange={() => {}} isOptional>
        <RadioListItem label="Option A" value="a" />
      </RadioList>,
    );
    expect(screen.getByText(/Optional/)).toBeInTheDocument();
  });

  it('renders error status message', () => {
    render(
      <RadioList
        label="Preference"
        value=""
        onChange={() => {}}
        status={{type: 'error', message: 'Please select an option'}}>
        <RadioListItem label="Option A" value="a" />
      </RadioList>,
    );
    expect(screen.getByText('Please select an option')).toBeInTheDocument();
  });

  it('renders warning status message', () => {
    render(
      <RadioList
        label="Preference"
        value="a"
        onChange={() => {}}
        status={{type: 'warning', message: 'This may change later'}}>
        <RadioListItem label="Option A" value="a" />
      </RadioList>,
    );
    expect(screen.getByText('This may change later')).toBeInTheDocument();
  });

  it('renders success status message', () => {
    render(
      <RadioList
        label="Preference"
        value="a"
        onChange={() => {}}
        status={{type: 'success', message: 'Great choice!'}}>
        <RadioListItem label="Option A" value="a" />
      </RadioList>,
    );
    expect(screen.getByText('Great choice!')).toBeInTheDocument();
  });

  it('renders startContent', () => {
    render(
      <RadioList label="Preference" value="" onChange={() => {}}>
        <RadioListItem
          label="Option A"
          value="a"
          startContent={<span data-testid="start">★</span>}
        />
      </RadioList>,
    );
    expect(screen.getByTestId('start')).toBeInTheDocument();
  });

  it('renders endContent', () => {
    render(
      <RadioList label="Preference" value="" onChange={() => {}}>
        <RadioListItem
          label="Option A"
          value="a"
          endContent={<span data-testid="end">Badge</span>}
        />
      </RadioList>,
    );
    expect(screen.getByTestId('end')).toBeInTheDocument();
  });

  it('supports data-testid on RadioList', () => {
    render(
      <RadioList
        label="Preference"
        value=""
        onChange={() => {}}
        data-testid="my-radio-list">
        <RadioListItem label="Option A" value="a" />
      </RadioList>,
    );
    expect(screen.getByTestId('my-radio-list')).toBeInTheDocument();
  });

  it('supports data-testid on RadioListItem', () => {
    render(
      <RadioList label="Preference" value="" onChange={() => {}}>
        <RadioListItem label="Option A" value="a" data-testid="my-radio-item" />
      </RadioList>,
    );
    expect(screen.getByTestId('my-radio-item')).toBeInTheDocument();
  });

  it('visually hides label when isLabelHidden is true', () => {
    render(
      <RadioList
        label="Hidden label"
        isLabelHidden
        value=""
        onChange={() => {}}>
        <RadioListItem label="Option A" value="a" />
      </RadioList>,
    );
    const label = screen.getByText('Hidden label');
    expect(label).toBeInTheDocument();
    // The radiogroup is named by the label element via aria-labelledby (not a
    // duplicated aria-label), so its accessible name is still "Hidden label".
    expect(
      screen.getByRole('radiogroup', {name: 'Hidden label'}),
    ).toBeInTheDocument();
    expect(screen.getByRole('radiogroup')).toHaveAttribute('aria-labelledby');
    expect(screen.getByRole('radiogroup')).not.toHaveAttribute('aria-label');
  });

  it('renders the group label as a span, not a label element (forms-14)', () => {
    render(
      <RadioList label="Plan" value="" onChange={() => {}}>
        <RadioListItem label="Free" value="free" />
        <RadioListItem label="Pro" value="pro" />
      </RadioList>,
    );
    // A radiogroup's accessible name must not come from a literal `<label>`
    // element — a `<label>` names a single control and can't be associated
    // with a group. It is rendered as a `<span>` and referenced via
    // aria-labelledby (with no orphaned htmlFor).
    const labelEl = screen.getByText('Plan');
    expect(labelEl.tagName).toBe('SPAN');
    expect(labelEl.closest('label')).toBeNull();
    expect(labelEl).not.toHaveAttribute('for');
    const group = screen.getByRole('radiogroup', {name: 'Plan'});
    expect(group.getAttribute('aria-labelledby')).toBe(labelEl.id);
  });

  it('renders description on items', () => {
    render(
      <RadioList label="Preference" value="" onChange={() => {}}>
        <RadioListItem
          label="Option A"
          value="a"
          description="This is option A"
        />
      </RadioList>,
    );
    expect(screen.getByText('This is option A')).toBeInTheDocument();
  });

  it('renders description on the radio list group', () => {
    render(
      <RadioList
        label="Preference"
        description="Choose your preference"
        value=""
        onChange={() => {}}>
        <RadioListItem label="Option A" value="a" />
      </RadioList>,
    );
    expect(screen.getByText('Choose your preference')).toBeInTheDocument();
  });

  it('applies horizontal orientation', () => {
    render(
      <RadioList
        label="Preference"
        value=""
        onChange={() => {}}
        orientation="horizontal">
        <RadioListItem label="Option A" value="a" />
        <RadioListItem label="Option B" value="b" />
      </RadioList>,
    );
    // The radiogroup should exist and contain items
    const radiogroup = screen.getByRole('radiogroup');
    expect(radiogroup).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });

  describe('focus management (no-selection tab stop)', () => {
    it('redirects to the last radio when focus enters an unselected group backward', () => {
      render(
        <>
          <RadioList label="Preference" value="" onChange={() => {}}>
            <RadioListItem label="Option A" value="a" />
            <RadioListItem label="Option B" value="b" />
            <RadioListItem label="Option C" value="c" />
          </RadioList>
          <button type="button">after</button>
        </>,
      );
      const radios = screen.getAllByRole('radio');
      const outside = screen.getByText('after');
      outside.focus();
      // Backward (Shift+Tab) entry: the browser focuses the last radio; the
      // group keeps it as the deterministic tab stop rather than jumping away.
      radios[radios.length - 1].focus();
      expect(radios[radios.length - 1]).toHaveFocus();
    });

    it('does not hijack focus moving between radios within the group', () => {
      render(
        <RadioList label="Preference" value="" onChange={() => {}}>
          <RadioListItem label="Option A" value="a" />
          <RadioListItem label="Option B" value="b" />
          <RadioListItem label="Option C" value="c" />
        </RadioList>,
      );
      const radios = screen.getAllByRole('radio');
      // Enter the group from outside, then move to a middle radio as arrow-key
      // navigation would. Intra-group movement must not be redirected back.
      radios[0].focus();
      radios[1].focus();
      expect(radios[1]).toHaveFocus();
      radios[2].focus();
      expect(radios[2]).toHaveFocus();
    });

    it('skips disabled radios when choosing the deterministic tab stop', () => {
      render(
        <>
          <button type="button">before</button>
          <RadioList label="Preference" value="" onChange={() => {}}>
            <RadioListItem label="Option A" value="a" isDisabled />
            <RadioListItem label="Option B" value="b" />
            <RadioListItem label="Option C" value="c" />
            <RadioListItem label="Option D" value="d" />
          </RadioList>
        </>,
      );
      const outside = screen.getByText('before');
      const optionB = screen.getByLabelText('Option B');
      const optionC = screen.getByLabelText('Option C');
      // A middle enabled radio (C) entered from outside is normalized to the
      // first *enabled* radio (B) — the disabled Option A is skipped.
      outside.focus();
      optionC.focus();
      expect(optionB).toHaveFocus();
    });
  });

  describe('disabledMessage', () => {
    const h = {hidden: true} as const;

    function renderGroup(props?: {onChange?: (v: string) => void}) {
      return render(
        <RadioList
          label="Plan"
          value="free"
          onChange={props?.onChange ?? (() => {})}
          isDisabled
          disabledMessage="Upgrade your account to change plans">
          <RadioListItem label="Free" value="free" />
          <RadioListItem label="Pro" value="pro" />
        </RadioList>,
      );
    }

    it('shows the reason tooltip on hover when the group is disabled with a reason', async () => {
      renderGroup();
      const tooltip = screen.getByRole('tooltip', h);
      expect(tooltip).toHaveTextContent('Upgrade your account to change plans');
      const group = screen.getByRole('radiogroup');
      fireEvent.mouseEnter(group);
      await waitFor(() => expect(tooltip).toHaveAttribute('popover-open'));
      fireEvent.mouseLeave(group);
      await waitFor(() => expect(tooltip).not.toHaveAttribute('popover-open'));
    });

    it('shows the reason tooltip on keyboard focus', async () => {
      const user = userEvent.setup();
      renderGroup();
      const tooltip = screen.getByRole('tooltip', h);
      await user.tab();
      await waitFor(() => expect(tooltip).toHaveAttribute('popover-open'));
    });

    it('does not render a tooltip when not disabled', () => {
      render(
        <RadioList
          label="Plan"
          value="free"
          onChange={() => {}}
          disabledMessage="Upgrade your account to change plans">
          <RadioListItem label="Free" value="free" />
        </RadioList>,
      );
      expect(screen.queryByRole('tooltip', h)).not.toBeInTheDocument();
    });

    it('does not render a tooltip when disabled without a reason', () => {
      render(
        <RadioList label="Plan" value="free" onChange={() => {}} isDisabled>
          <RadioListItem label="Free" value="free" />
        </RadioList>,
      );
      expect(screen.queryByRole('tooltip', h)).not.toBeInTheDocument();
    });

    it('blocks selection while focusable-disabled', () => {
      const onChange = vi.fn();
      renderGroup({onChange});
      const pro = screen.getByRole('radio', {name: 'Pro', hidden: true});
      fireEvent.click(pro);
      expect(onChange).not.toHaveBeenCalled();
    });
  });
  describe('form participation', () => {
    it('submits the selected value under htmlName', () => {
      const {container} = render(
        <form>
          <RadioList
            label="Preference"
            htmlName="pref"
            value="b"
            onChange={() => {}}>
            <RadioListItem label="Option A" value="a" />
            <RadioListItem label="Option B" value="b" />
          </RadioList>
        </form>,
      );
      const data = new FormData(container.querySelector('form')!);
      expect(data.get('pref')).toBe('b');
    });

    it('is excluded from form data when disabled, even with a disabledMessage', () => {
      const {container} = render(
        <form>
          <RadioList
            label="Preference"
            htmlName="pref"
            value="a"
            onChange={() => {}}
            isDisabled
            disabledMessage="Locked">
            <RadioListItem label="Option A" value="a" />
          </RadioList>
        </form>,
      );
      expect([
        ...new FormData(container.querySelector('form')!).keys(),
      ]).toEqual([]);
    });

    it('keeps working as an isolated group when htmlName is omitted', () => {
      const {container} = render(
        <form>
          <RadioList label="Preference" value="a" onChange={() => {}}>
            <RadioListItem label="Option A" value="a" />
          </RadioList>
        </form>,
      );
      // Auto-generated internal name still groups the radios, but the field
      // name is not part of the public form contract.
      const input = container.querySelector('input[type="radio"]')!;
      expect(input.getAttribute('name')).toBeTruthy();
    });
  });

  describe('RadioListItem rest forwarding', () => {
    it('forwards align to its Item row unchanged', () => {
      render(
        <RadioList label="Preference" value="" onChange={() => {}}>
          <RadioListItem label="Option A" value="a" data-testid="item-a" />
          <RadioListItem
            label="Option B"
            value="b"
            align="first-line"
            data-testid="item-b"
          />
        </RadioList>,
      );
      expect(screen.getByTestId('item-a')).toHaveAttribute(
        'data-align',
        'center',
      );
      expect(screen.getByTestId('item-b')).toHaveAttribute(
        'data-align',
        'first-line',
      );
    });

    it('forwards data-testid, id, and aria-* to the item root element', () => {
      render(
        <RadioList label="Preference" value="" onChange={() => {}}>
          <RadioListItem
            label="Option A"
            value="a"
            data-testid="item-a"
            id="item-a-id"
            aria-describedby="help-text"
          />
        </RadioList>,
      );
      const item = screen.getByTestId('item-a');
      expect(item).toHaveAttribute('id', 'item-a-id');
      expect(item).toHaveAttribute('aria-describedby', 'help-text');
    });

    it('routes aria-label to the radio control, not the row', () => {
      render(
        <RadioList label="Preference" value="" onChange={() => {}}>
          <RadioListItem
            label="Option A"
            value="a"
            data-testid="item-a"
            aria-label="Option A, first option"
          />
        </RadioList>,
      );
      expect(screen.getByTestId('item-a')).not.toHaveAttribute('aria-label');
      expect(
        screen.getByRole('radio', {name: 'Option A, first option'}),
      ).toBeInTheDocument();
    });
  });

  describe('RadioListItem rich content', () => {
    it('names the radio from the text of a ReactNode label', () => {
      render(
        <RadioList label="Plans" value="" onChange={() => {}}>
          <RadioListItem
            label={
              <span>
                Pro plan <em>(recommended)</em>
              </span>
            }
            value="pro"
          />
        </RadioList>,
      );
      // The radio points at its visible label, so the name is computed from
      // the rich node's own text.
      expect(
        screen.getByRole('radio', {name: 'Pro plan (recommended)'}),
      ).toBeInTheDocument();
    });

    it('lets aria-label override the name a ReactNode label would compute', () => {
      render(
        <RadioList label="Plans" value="" onChange={() => {}}>
          <RadioListItem
            label={
              <span>
                Pro plan <em>(recommended)</em>
              </span>
            }
            aria-label="Pro plan (recommended) option"
            value="pro"
          />
        </RadioList>,
      );
      expect(
        screen.getByRole('radio', {name: 'Pro plan (recommended) option'}),
      ).toBeInTheDocument();
    });

    it('selects the option when a ReactNode label is clicked', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      render(
        <RadioList label="Plans" value="" onChange={onChange}>
          <RadioListItem label={<span>Pro plan</span>} value="pro" />
        </RadioList>,
      );
      await user.click(screen.getByText('Pro plan'));
      expect(onChange).toHaveBeenCalledWith('pro');
    });

    it('keeps a link in a ReactNode label independent from selection', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      render(
        <RadioList label="Plans" value="" onChange={onChange}>
          <RadioListItem
            label={
              <>
                Pro plan <a href="#pricing">pricing details</a>
              </>
            }
            aria-label="Pro plan pricing details"
            value="pro"
          />
        </RadioList>,
      );
      const radio = screen.getByRole('radio', {
        name: 'Pro plan pricing details',
      });
      const link = screen.getByRole('link', {name: 'pricing details'});
      await user.tab();
      expect(radio).toHaveFocus();
      await user.tab();
      expect(link).toHaveFocus();
      await user.click(link);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('renders a ReactNode description and keeps it linked to the radio', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      render(
        <RadioList label="Plans" value="" onChange={onChange}>
          <RadioListItem
            label="Pro plan"
            description={
              <span>
                See the <a href="#pricing">pricing page</a>
              </span>
            }
            value="pro"
          />
        </RadioList>,
      );
      const radio = screen.getByRole('radio', {name: 'Pro plan'});
      expect(radio).toHaveAccessibleDescription('See the pricing page');
      // The row delegates surface clicks to the radio, but a nested link is
      // its own click target — following it must not also select the option.
      await user.click(screen.getByRole('link', {name: 'pricing page'}));
      expect(onChange).not.toHaveBeenCalled();
    });

    it('leaves aria-describedby off when a conditional description renders nothing', () => {
      const showDetails = false;
      render(
        <RadioList label="Plans" value="" onChange={() => {}}>
          <RadioListItem
            label="Pro plan"
            // The common conditional-slot idiom yields `false`, not undefined.
            description={showDetails && <span>Billing details</span>}
            value="pro"
          />
        </RadioList>,
      );
      expect(screen.getByRole('radio')).not.toHaveAttribute('aria-describedby');
    });
  });

  describe('radio-list-item theme target', () => {
    it('renders astryx-radio-list-item, with its size, on every row', () => {
      render(
        <RadioList label="Preference" value="" onChange={() => {}} size="sm">
          <RadioListItem label="Option A" value="a" data-testid="row-a" />
          <RadioListItem label="Option B" value="b" data-testid="row-b" />
        </RadioList>,
      );
      for (const testid of ['row-a', 'row-b']) {
        const row = screen.getByTestId(testid);
        expect(row).toHaveClass('astryx-radio-list-item');
        expect(row).toHaveAttribute('data-size', 'sm');
        expect(row).toHaveAttribute('data-size', 'sm');
      }
    });

    it('carries the selected and disabled states a theme keys on', () => {
      render(
        <RadioList label="Preference" value="a" onChange={() => {}}>
          <RadioListItem label="Option A" value="a" data-testid="selected" />
          <RadioListItem label="Option B" value="b" data-testid="plain" />
          <RadioListItem
            label="Option C"
            value="c"
            isDisabled
            data-testid="disabled"
          />
        </RadioList>,
      );
      const selected = screen.getByTestId('selected');
      const plain = screen.getByTestId('plain');
      const disabled = screen.getByTestId('disabled');

      expect(selected).toHaveAttribute('data-selected', 'selected');
      expect(selected).toHaveAttribute('data-selected', 'selected');
      expect(plain).not.toHaveAttribute('data-selected');
      expect(plain).not.toHaveAttribute('data-selected');

      expect(disabled).toHaveAttribute('data-disabled', 'disabled');
      expect(disabled).toHaveAttribute('data-disabled', 'disabled');
      expect(plain).not.toHaveAttribute('data-disabled');
    });

    it('rides the painting row element (astryx-item), not a bare layout wrapper', () => {
      // The row target must sit on the element Item paints — the surface that
      // renders hover, density padding, and radius — so a theme styling
      // `radio-list-item`'s background/padding/borderRadius (and its `:hover`)
      // actually takes effect. Converges with how ListItem lands `list-item`
      // on the same element as `astryx-item`. The same element also carries
      // the reflected `data-size`, proving the variant surface moved with it.
      const {container} = render(
        <RadioList label="Preference" value="" onChange={() => {}}>
          <RadioListItem label="Option A" value="a" data-testid="row" />
        </RadioList>,
      );
      const row = screen.getByTestId('row');
      // A single element carries both the paint class and the theme target.
      expect(row).toHaveClass('astryx-item');
      expect(row).toHaveClass('astryx-radio-list-item');
      expect(row).toHaveAttribute('data-size');
      // No separate layout wrapper survives outside the painting row: the
      // target-bearing element is the same one Item renders.
      expect(
        container.querySelectorAll('.astryx-radio-list-item'),
      ).toHaveLength(1);
    });

    it('keeps the bare default row appearance: zeroed padding/radius, no default background', () => {
      // The architectural win — the target rides the painting Item — must not
      // change the DEFAULT look. The painting row zeroes Item's density
      // padding, its radius, and its interactive hover/press background, so an
      // unthemed RadioList renders as a flat surface (only the indicator tints
      // on hover via `indicatorScope`). This matches the appearance before the
      // target moved onto Item; a theme's `radio-list-item` overrides still win
      // from the higher `astryx-theme` layer.
      render(
        <RadioList label="Preference" value="a" onChange={() => {}}>
          <RadioListItem label="Selected" value="a" data-testid="selected" />
          <RadioListItem label="Plain" value="b" data-testid="plain" />
        </RadioList>,
      );
      const cssFor = (className: string): string => {
        const rules: string[] = [];
        const walk = (list: CSSRuleList) => {
          for (const rule of Array.from(list)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const anyRule = rule as any;
            if (anyRule.cssRules) {
              walk(anyRule.cssRules);
            }
            if (
              typeof anyRule.cssText === 'string' &&
              anyRule.cssText.includes(`.${className}`)
            ) {
              rules.push(anyRule.cssText);
            }
          }
        };
        for (const sheet of Array.from(document.styleSheets)) {
          try {
            walk(sheet.cssRules);
          } catch {
            // cross-origin/inaccessible sheet — skip
          }
        }
        return rules.join('\n');
      };

      const plain = screen.getByTestId('plain');
      const atoms = plain.className
        .split(/\s+/)
        .filter(c => /^x[a-z0-9]+$/i.test(c));
      const declarations = atoms.map(cssFor).join('\n');

      // The bare-look declarations land on the painting row.
      expect(declarations).toMatch(/padding-block:\s*0/);
      expect(declarations).toMatch(/padding-inline:\s*0/);
      expect(declarations).toMatch(/border-radius:\s*0/);
      expect(declarations).toMatch(/background-color:\s*transparent/);

      // No default full-row hover highlight: the flat transparent background
      // replaces Item's interactive `:hover` overlay, so no hover rule paints
      // the row's own background. (The indicator still tints via its scope.)
      expect(declarations).not.toMatch(
        /:hover[^{]*\{[^}]*background-color:\s*var\(--color-overlay-hover\)/,
      );

      // No default selected-row background: the selected row differs from the
      // plain row only by state markers, not by a painted background class.
      const selected = screen.getByTestId('selected');
      const selectedAtoms = selected.className
        .split(/\s+/)
        .filter(c => /^x[a-z0-9]+$/i.test(c));
      const selectedDecls = selectedAtoms.map(cssFor).join('\n');
      expect(selectedDecls).not.toMatch(
        /background-color:\s*var\(--color-accent-muted\)/,
      );
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
            <RadioList size={size} label="Choice" value="" onChange={() => {}}>
              <RadioListItem label="Option A" value="a" />
            </RadioList>
          </div>,
        );

        const input = container.querySelector(
          'input[type="radio"]',
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
  it('compiles a forced-colors fill so the selected dot survives Windows High Contrast', () => {
    render(
      <RadioList label="Preference" value="a" onChange={() => {}}>
        <RadioListItem label="Option A" value="a" />
      </RadioList>,
    );
    // The painted inner dot would be stripped to Canvas (invisible), making
    // checked and unchecked radios identical; CanvasText keeps it perceivable.
    expect(getForcedColorsRules()).toContain('background-color: canvastext;');
  });
});

/** Does the element's own CSS paint the row's mouse press (`--_radio-row-press`)? */
function readsRowPress(el: Element): boolean {
  return rulesDeclaredFor(el).some(rule =>
    rule.includes('var(--_radio-row-press'),
  );
}

/**
 * Does the row declare the mouse press's paint while pressed, but not while a
 * nested link or button is the pressed one?
 */
function declaresRowPress(el: Element): boolean {
  return rulesWithSelector(el, ':active').some(
    rule =>
      rule.includes('--_radio-row-press:') &&
      rule.includes('var(--color-overlay-pressed)') &&
      /:not\(:has\(a:active, ?button:active/.test(rule),
  );
}

describe('pressed state', () => {
  it('paints the pressed overlay over the radio indicator while the row is pressed', () => {
    const {container} = render(
      <RadioList label="Plan" value="a" onChange={() => {}}>
        <RadioListItem label="Option A" value="a" />
        <RadioListItem label="Option B" value="b" />
      </RadioList>,
    );
    const circle = container.querySelector('.astryx-radio-indicator');
    const wrapper = circle?.parentElement?.parentElement;
    const row = circle?.closest('[data-astryx-pressable]');
    if (wrapper == null || row == null) {
      throw new Error('the radio has no pressable row or indicator wrapper');
    }
    // The row declares the mouse press's paint while it is pressed, and the
    // layer over the circle reads it.
    expect(declaresRowPress(row)).toBe(true);
    expect(readsRowPress(wrapper)).toBe(true);
  });

  it('does not expose a pressed arm on a disabled radio', () => {
    const {container} = render(
      <RadioList label="Plan" value="a" onChange={() => {}}>
        <RadioListItem label="Unavailable" value="b" isDisabled />
      </RadioList>,
    );
    const circle = container.querySelector('.astryx-radio-indicator');
    const wrapper = circle?.parentElement?.parentElement;
    const row = wrapper?.closest('.astryx-item');
    if (wrapper == null || row == null) {
      throw new Error('the radio has no row or indicator wrapper');
    }
    expect(declaresRowPress(row)).toBe(false);
    expect(readsRowPress(wrapper)).toBe(false);
  });

  it('fades the touch press out from the row, with the overlay reading its strength', () => {
    const {container} = render(
      <RadioList label="Plan" value="a" onChange={() => {}}>
        <RadioListItem label="Option A" value="a" />
        <RadioListItem label="Option B" value="b" />
      </RadioList>,
    );
    const circle = container.querySelector('.astryx-radio-indicator');
    const wrapper = circle?.parentElement?.parentElement;
    const row = circle?.closest('[data-astryx-pressable]');
    if (wrapper == null || row == null) {
      throw new Error('the radio has no pressable row or indicator wrapper');
    }
    // The controller writes the row; the row owns the strength and its
    // release, and the owner-drawn layer over the circle paints the pressed
    // token at that strength on both touch arms.
    expect(hasReleaseFade(row)).toBe(true);
    expect(readsPressStrength(wrapper, '[data-astryx-press="on"]')).toBe(true);
    expect(readsPressStrength(wrapper)).toBe(true);
    // The row itself paints nothing under a finger, as under a mouse: only
    // the circle answers.
    expect(readsPressStrength(row, '[data-astryx-press="on"]')).toBe(false);
  });
});
