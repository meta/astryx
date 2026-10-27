// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CheckboxList.test.tsx
 * @input Uses vitest, @testing-library/react, CheckboxList, CheckboxListItem
 * @output Unit tests for CheckboxList and CheckboxListItem behavior
 * @position Testing; validates CheckboxList.tsx and CheckboxListItem.tsx implementation
 *
 * SYNC: When CheckboxList.tsx or CheckboxListItem.tsx changes, update tests to match new behavior
 */

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {createRef} from 'react';
import {
  render,
  screen,
  fireEvent,
  within,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as stylex from '@stylexjs/stylex';
import {CheckboxList} from './CheckboxList';
import {CheckboxListItem} from './CheckboxListItem';
import {__resetLiveRegionsForTest} from '../hooks/useAnnounce';
import {List} from '../List/List';
import {CheckboxInput} from '../CheckboxInput/CheckboxInput';
import {indicatorScope} from '../Indicator/indicator.markers.stylex';
import {stubMatchMedia} from '../__tests__/stubMatchMedia';
import {
  hasPressedArm,
  readsPressStrength,
  rulesDeclaredFor,
} from '../__tests__/pressState';
import {
  declaresIndicatorPressOwner,
  layerPressRulesBehindPointer,
  ownerPressRulesBehindPointer,
  readIndicatorPressLayer,
  readsAncestorPress,
  readsIndicatorPress,
} from '../__tests__/indicatorPressLayer';
import {cellPressConsts} from '../utils/rowPressLayer.stylex';

// FieldStatus announces status messages through the persistent useAnnounce
// singletons; remove them between tests so role/aria-live queries in this
// file never match a leftover region.
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

describe('CheckboxList', () => {
  it('forwards CheckboxListItem align to its Item row unchanged', () => {
    render(
      <CheckboxList label="Toppings" value={[]} onChange={() => {}}>
        <CheckboxListItem label="Cheese" value="cheese" data-testid="cheese" />
        <CheckboxListItem
          label="Olives"
          value="olives"
          align="first-line"
          data-testid="olives"
        />
      </CheckboxList>,
    );
    expect(screen.getByTestId('cheese')).toHaveAttribute(
      'data-align',
      'center',
    );
    expect(screen.getByTestId('olives')).toHaveAttribute(
      'data-align',
      'first-line',
    );
  });

  it('renders with label', () => {
    render(
      <CheckboxList label="Preferences" value={[]} onChange={() => {}}>
        <CheckboxListItem label="Option A" value="a" />
      </CheckboxList>,
    );
    expect(screen.getByText('Preferences')).toBeInTheDocument();
  });

  it('wraps items in a group named by the label (forms audit: group role)', () => {
    render(
      <CheckboxList label="Preferences" value={[]} onChange={() => {}}>
        <CheckboxListItem label="Option A" value="a" />
      </CheckboxList>,
    );
    // The checkboxes are wrapped in a role="group" whose accessible name comes
    // from the field label (via aria-labelledby). The label is rendered as a
    // <span> (not a literal <label>, which can't name a group) with no
    // orphaned htmlFor.
    const group = screen.getByRole('group', {name: 'Preferences'});
    expect(group).toBeInTheDocument();
    const label = screen.getByText('Preferences');
    expect(label.tagName).toBe('SPAN');
    expect(label.closest('label')).toBeNull();
    expect(label).not.toHaveAttribute('for');
    expect(group.getAttribute('aria-labelledby')).toBe(label.id);
  });

  it('renders checkbox items', () => {
    render(
      <CheckboxList label="Preferences" value={[]} onChange={() => {}}>
        <CheckboxListItem label="Option A" value="a" />
        <CheckboxListItem label="Option B" value="b" />
        <CheckboxListItem label="Option C" value="c" />
      </CheckboxList>,
    );
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
  });

  it('checks the correct items based on value prop', () => {
    render(
      <CheckboxList label="Preferences" value={['a', 'c']} onChange={() => {}}>
        <CheckboxListItem label="Option A" value="a" />
        <CheckboxListItem label="Option B" value="b" />
        <CheckboxListItem label="Option C" value="c" />
      </CheckboxList>,
    );
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();
    expect(checkboxes[2]).toBeChecked();
  });

  it('calls onChange with added value when checking an item', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <CheckboxList label="Preferences" value={['a']} onChange={handleChange}>
        <CheckboxListItem label="Option A" value="a" />
        <CheckboxListItem label="Option B" value="b" />
      </CheckboxList>,
    );

    await user.click(screen.getByRole('checkbox', {name: 'Option B'}));
    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith(['a', 'b']);
  });

  it('calls onChange with removed value when unchecking an item', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <CheckboxList
        label="Preferences"
        value={['a', 'b']}
        onChange={handleChange}>
        <CheckboxListItem label="Option A" value="a" />
        <CheckboxListItem label="Option B" value="b" />
      </CheckboxList>,
    );

    await user.click(screen.getByRole('checkbox', {name: 'Option A'}));
    expect(handleChange).toHaveBeenCalledWith(['b']);
  });

  it('fires a consumer onClick on an item in addition to toggling', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    const handleClick = vi.fn();
    render(
      <CheckboxList label="Preferences" value={['a']} onChange={handleChange}>
        <CheckboxListItem label="Option A" value="a" />
        <CheckboxListItem label="Option B" value="b" onClick={handleClick} />
      </CheckboxList>,
    );

    // The row is a pointer-only click surface (no invisible row button — the
    // checkbox is the option's only tab stop). Click the row's label area,
    // where the composed onClick fires — not the inner checkbox.
    expect(
      screen.queryByRole('button', {name: 'Option B'}),
    ).not.toBeInTheDocument();
    // The text also exists in the checkbox's visually hidden <label>; target
    // the row's label <span> to click the row surface.
    await user.click(screen.getByText('Option B', {selector: 'span'}));

    expect(handleClick).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith(['a', 'b']);
  });

  describe('single tab stop per option (WCAG 4.1.2 / APG checkbox pattern)', () => {
    it('renders exactly one focusable control per option — the checkbox, no row button', () => {
      render(
        <CheckboxList label="Preferences" value={['a']} onChange={() => {}}>
          <CheckboxListItem label="Option A" value="a" />
          <CheckboxListItem label="Option B" value="b" />
        </CheckboxList>,
      );
      // No invisible whole-row button duplicating the checkbox's action.
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      for (const item of screen.getAllByRole('listitem')) {
        const focusables = item.querySelectorAll(
          'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        expect(focusables).toHaveLength(1);
        expect(focusables[0]).toBe(within(item).getByRole('checkbox'));
      }
    });

    it('Tab moves directly from one option checkbox to the next', async () => {
      const user = userEvent.setup();
      render(
        <CheckboxList label="Preferences" value={[]} onChange={() => {}}>
          <CheckboxListItem label="Option A" value="a" />
          <CheckboxListItem label="Option B" value="b" />
        </CheckboxList>,
      );
      await user.tab();
      expect(screen.getByRole('checkbox', {name: 'Option A'})).toHaveFocus();
      await user.tab();
      expect(screen.getByRole('checkbox', {name: 'Option B'})).toHaveFocus();
      // No further tab stop inside the list (the row itself is not focusable).
      await user.tab();
      expect(document.body).toHaveFocus();
    });

    it('clicking the row surface (outside the checkbox) still toggles', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      render(
        <CheckboxList label="Preferences" value={['a']} onChange={handleChange}>
          <CheckboxListItem label="Option A" value="a" />
          <CheckboxListItem label="Option B" value="b" />
        </CheckboxList>,
      );
      // The text also exists in the checkbox's visually hidden <label>;
      // target the row's label <span> to click the row surface.
      await user.click(screen.getByText('Option B', {selector: 'span'}));
      expect(handleChange).toHaveBeenCalledTimes(1);
      expect(handleChange).toHaveBeenCalledWith(['a', 'b']);
    });

    it('toggles with Space on the focused checkbox, which reports checked state', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      render(
        <CheckboxList label="Preferences" value={['a']} onChange={handleChange}>
          <CheckboxListItem label="Option A" value="a" />
          <CheckboxListItem label="Option B" value="b" />
        </CheckboxList>,
      );
      await user.tab();
      // The focused control is the checkbox itself, so its accessible name
      // and checked state are what assistive tech announces on focus.
      const checkboxA = screen.getByRole('checkbox', {name: 'Option A'});
      expect(checkboxA).toHaveFocus();
      expect(checkboxA).toBeChecked();
      await user.keyboard(' ');
      expect(handleChange).toHaveBeenCalledTimes(1);
      expect(handleChange).toHaveBeenCalledWith([]);
    });

    it('the row itself is not focusable', () => {
      render(
        <CheckboxList label="Preferences" value={[]} onChange={() => {}}>
          <CheckboxListItem label="Option A" value="a" />
        </CheckboxList>,
      );
      const item = screen.getByRole('listitem');
      expect(item).not.toHaveAttribute('tabindex');
      item.focus();
      expect(item).not.toHaveFocus();
    });
  });

  it('disables all checkboxes when group isDisabled is true', () => {
    render(
      <CheckboxList
        label="Preferences"
        value={[]}
        onChange={() => {}}
        isDisabled>
        <CheckboxListItem label="Option A" value="a" />
        <CheckboxListItem label="Option B" value="b" />
      </CheckboxList>,
    );
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0]).toHaveAttribute('aria-disabled', 'true');
    expect(checkboxes[1]).toHaveAttribute('aria-disabled', 'true');
    expect(checkboxes[0]).not.toHaveAttribute('disabled');
  });

  it('does not call onChange when group is disabled', () => {
    const handleChange = vi.fn();
    render(
      <CheckboxList
        label="Preferences"
        value={[]}
        onChange={handleChange}
        isDisabled>
        <CheckboxListItem label="Option A" value="a" />
      </CheckboxList>,
    );

    // Use fireEvent since userEvent correctly blocks pointer-events: none
    fireEvent.click(screen.getByRole('checkbox', {name: 'Option A'}));
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('disables individual item when item isDisabled is true', () => {
    render(
      <CheckboxList label="Preferences" value={[]} onChange={() => {}}>
        <CheckboxListItem label="Option A" value="a" />
        <CheckboxListItem label="Option B" value="b" isDisabled />
      </CheckboxList>,
    );
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0]).not.toHaveAttribute('aria-disabled');
    expect(checkboxes[1]).toHaveAttribute('aria-disabled', 'true');
    expect(checkboxes[1]).not.toHaveAttribute('disabled');
  });

  it('throws when item has no value prop inside collection-mode CheckboxList', () => {
    // Suppress console.error for expected error
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => {
      render(
        <CheckboxList label="Preferences" value={[]} onChange={() => {}}>
          <CheckboxListItem label="No value" />
        </CheckboxList>,
      );
    }).toThrow(
      'CheckboxListItem requires a `value` prop when used inside CheckboxList with a value array.',
    );
    spy.mockRestore();
  });

  it('renders error status message', () => {
    render(
      <CheckboxList
        label="Preferences"
        value={[]}
        onChange={() => {}}
        status={{type: 'error', message: 'Select at least one'}}>
        <CheckboxListItem label="Option A" value="a" />
      </CheckboxList>,
    );
    expect(screen.getByText('Select at least one')).toBeInTheDocument();
  });

  it('renders description on items', () => {
    render(
      <CheckboxList label="Preferences" value={[]} onChange={() => {}}>
        <CheckboxListItem
          label="Option A"
          value="a"
          description="This is option A"
        />
      </CheckboxList>,
    );
    expect(screen.getByText('This is option A')).toBeInTheDocument();
  });

  it('renders a ReactNode description on items', () => {
    render(
      <CheckboxList label="Plans" value={[]} onChange={() => {}}>
        <CheckboxListItem
          label="Pro plan"
          value="pro"
          description={
            <span>
              See the <a href="#pricing">pricing page</a>
            </span>
          }
        />
      </CheckboxList>,
    );
    expect(
      screen.getByRole('link', {name: 'pricing page'}),
    ).toBeInTheDocument();
  });

  it('keeps a link in a ReactNode label independent from selection', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <CheckboxList label="Plans" value={[]} onChange={onChange}>
        <CheckboxListItem
          label={
            <>
              Pro plan <a href="#pricing">pricing details</a>
            </>
          }
          aria-label="Pro plan pricing details"
          value="pro"
        />
      </CheckboxList>,
    );
    const checkbox = screen.getByRole('checkbox', {
      name: 'Pro plan pricing details',
    });
    const link = screen.getByRole('link', {name: 'pricing details'});
    await user.tab();
    expect(checkbox).toHaveFocus();
    await user.tab();
    expect(link).toHaveFocus();
    await user.click(link);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('exposes a string description to the checkbox via aria-describedby', () => {
    render(
      <List>
        <CheckboxListItem
          label="Email"
          description="Receive notifications by email"
        />
      </List>,
    );
    const checkbox = screen.getByRole('checkbox', {name: 'Email'});
    const ids = checkbox.getAttribute('aria-describedby');
    expect(ids).not.toBeNull();
    const target = document.getElementById(ids!);
    expect(target).toHaveTextContent('Receive notifications by email');
  });

  it('exposes a ReactNode description to the checkbox via aria-describedby', () => {
    render(
      <List>
        <CheckboxListItem
          label="Pro plan"
          description={
            <span>
              See the <a href="#pricing">pricing page</a>
            </span>
          }
        />
      </List>,
    );
    const checkbox = screen.getByRole('checkbox', {name: 'Pro plan'});
    const target = document.getElementById(
      checkbox.getAttribute('aria-describedby')!,
    );
    expect(target).toHaveTextContent('See the pricing page');
  });

  it('adds no aria-describedby when the description is absent or empty', () => {
    render(
      <List>
        <CheckboxListItem label="Plain" />
        <CheckboxListItem label="Empty" description="" />
        <CheckboxListItem label="False" description={false} />
      </List>,
    );
    for (const name of ['Plain', 'Empty', 'False']) {
      expect(screen.getByRole('checkbox', {name})).not.toHaveAttribute(
        'aria-describedby',
      );
    }
  });

  it('renders description on the checkbox list group', () => {
    render(
      <CheckboxList
        label="Preferences"
        description="Choose your preferences"
        value={[]}
        onChange={() => {}}>
        <CheckboxListItem label="Option A" value="a" />
      </CheckboxList>,
    );
    expect(screen.getByText('Choose your preferences')).toBeInTheDocument();
  });

  it('describes the group with its description and status message', () => {
    render(
      <CheckboxList
        label="Preferences"
        description="Choose your preferences"
        status={{type: 'error', message: 'Select at least one'}}
        value={[]}
        onChange={() => {}}>
        <CheckboxListItem label="Option A" value="a" />
      </CheckboxList>,
    );
    expect(
      screen.getByRole('group', {name: 'Preferences'}),
    ).toHaveAccessibleDescription(
      'Choose your preferences Select at least one',
    );
  });

  it('forwards ref to the group, container* to the field root, and item styling to the row', () => {
    const listRef = createRef<HTMLDivElement>();
    const itemRef = createRef<HTMLLIElement>();
    const {container} = render(
      <CheckboxList
        ref={listRef}
        label="Preferences"
        containerClassName="consumer-list"
        containerStyle={{marginTop: 12}}
        value={[]}
        onChange={() => {}}>
        <CheckboxListItem
          ref={itemRef}
          label="Option A"
          value="a"
          className="consumer-item"
          style={{marginTop: 4}}
        />
      </CheckboxList>,
    );
    expect(listRef.current).toBe(
      screen.getByRole('group', {name: 'Preferences'}),
    );
    const fieldRoot = container.querySelector('.consumer-list');
    expect(fieldRoot).toHaveClass('astryx-checkbox-list');
    expect(fieldRoot).toHaveStyle({marginTop: '12px'});
    expect(fieldRoot).toContainElement(listRef.current);
    const row = screen.getByRole('listitem');
    expect(itemRef.current).toBe(row);
    expect(row).toHaveClass('consumer-item', 'astryx-list-item');
    expect(row).toHaveStyle({marginTop: '4px'});
  });

  it('supports data-testid on CheckboxList', () => {
    render(
      <CheckboxList
        label="Preferences"
        value={[]}
        onChange={() => {}}
        data-testid="my-checkbox-list">
        <CheckboxListItem label="Option A" value="a" />
      </CheckboxList>,
    );
    expect(screen.getByTestId('my-checkbox-list')).toBeInTheDocument();
  });

  it('passes spacious density through to checkbox list items', () => {
    render(
      <CheckboxList
        label="Preferences"
        density="spacious"
        value={[]}
        onChange={() => {}}>
        <CheckboxListItem label="Option A" value="a" />
      </CheckboxList>,
    );
    expect(screen.getByRole('listitem')).toHaveAttribute(
      'data-density',
      'spacious',
    );
  });

  it('supports data-testid on CheckboxListItem', () => {
    render(
      <CheckboxList label="Preferences" value={[]} onChange={() => {}}>
        <CheckboxListItem
          label="Option A"
          value="a"
          data-testid="my-checkbox-item"
        />
      </CheckboxList>,
    );
    expect(screen.getByTestId('my-checkbox-item')).toBeInTheDocument();
  });

  it('renders endContent', () => {
    render(
      <CheckboxList label="Preferences" value={[]} onChange={() => {}}>
        <CheckboxListItem
          label="Option A"
          value="a"
          endContent={<span data-testid="end">Badge</span>}
        />
      </CheckboxList>,
    );
    expect(screen.getByTestId('end')).toBeInTheDocument();
  });

  it('does not toggle when clicking interactive endContent', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <CheckboxList label="Preferences" value={[]} onChange={handleChange}>
        <CheckboxListItem
          label="Option A"
          value="a"
          endContent={
            <button type="button" data-testid="end-btn">
              Action
            </button>
          }
        />
      </CheckboxList>,
    );

    await user.click(screen.getByTestId('end-btn'));
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('allows standalone items inside CheckboxList without parent value (select-all pattern)', async () => {
    const user = userEvent.setup();
    const handleSelectAll = vi.fn();
    const handleCheck = vi.fn();
    render(
      <CheckboxList label="Columns" hasDividers>
        <CheckboxListItem
          label="Select all"
          isChecked={false}
          onCheck={handleSelectAll}
        />
        <CheckboxListItem label="Name" isChecked={true} onCheck={handleCheck} />
        <CheckboxListItem
          label="Email"
          isChecked={false}
          onCheck={handleCheck}
        />
      </CheckboxList>,
    );

    // All items render without throwing
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);

    // Select all triggers its own handler
    await user.click(screen.getByRole('checkbox', {name: 'Select all'}));
    expect(handleSelectAll).toHaveBeenCalledWith(true);
    expect(handleCheck).not.toHaveBeenCalled();
  });
});

describe('CheckboxListItem standalone mode', () => {
  it('ignores isChecked and onCheck when the parent CheckboxList has a value array', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onCheck = vi.fn();
    render(
      <CheckboxList label="Preferences" value={[]} onChange={onChange}>
        <CheckboxListItem
          label="Option A"
          value="a"
          isChecked
          onCheck={onCheck}
        />
      </CheckboxList>,
    );
    const checkbox = screen.getByRole('checkbox', {name: 'Option A'});
    // The list's value array owns checked state in collection mode.
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    expect(onChange).toHaveBeenCalledWith(['a']);
    expect(onCheck).not.toHaveBeenCalled();
  });

  it('renders the sm checkbox at compact density and md otherwise', () => {
    const {unmount} = render(
      <CheckboxList
        label="Preferences"
        density="compact"
        value={[]}
        onChange={() => {}}>
        <CheckboxListItem label="Option A" value="a" />
      </CheckboxList>,
    );
    const compactField = screen
      .getByRole('checkbox')
      .closest('.astryx-checkbox-input');
    expect(compactField).toHaveAttribute('data-size', 'sm');
    unmount();
    render(
      <List>
        <CheckboxListItem label="Option A" />
      </List>,
    );
    const balancedField = screen
      .getByRole('checkbox')
      .closest('.astryx-checkbox-input');
    expect(balancedField).toHaveAttribute('data-size', 'md');
  });

  it('uses isChecked/onCheck for standalone control', async () => {
    const user = userEvent.setup();
    const handleCheck = vi.fn();
    render(
      <List>
        <CheckboxListItem
          label="Accept terms"
          isChecked={false}
          onCheck={handleCheck}
        />
      </List>,
    );

    await user.click(screen.getByRole('checkbox', {name: 'Accept terms'}));
    expect(handleCheck).toHaveBeenCalledWith(true);
  });

  it('renders checked state from isChecked prop', () => {
    render(
      <List>
        <CheckboxListItem label="Checked item" isChecked={true} />
      </List>,
    );
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('renders unchecked when no isChecked provided', () => {
    render(
      <List>
        <CheckboxListItem label="Default item" />
      </List>,
    );
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('does not throw without value prop in standalone mode', () => {
    expect(() => {
      render(
        <List>
          <CheckboxListItem label="No value needed" />
        </List>,
      );
    }).not.toThrow();
  });

  it('renders indeterminate state', () => {
    render(
      <List>
        <CheckboxListItem label="Partial" isChecked="indeterminate" />
      </List>,
    );
    // The inner native checkbox exposes mixed state via the indeterminate DOM
    // property (not a redundant aria-checked, forms-16). The list row is a
    // plain listitem and must not carry aria-checked (aria-allowed-attr).
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeInstanceOf(HTMLInputElement);
    if (checkbox instanceof HTMLInputElement) {
      expect(checkbox.indeterminate).toBe(true);
    }
    expect(checkbox).not.toHaveAttribute('aria-checked');
  });

  it('calls onCheck with true when clicking indeterminate item', async () => {
    const user = userEvent.setup();
    const handleCheck = vi.fn();
    render(
      <List>
        <CheckboxListItem
          label="Partial"
          isChecked="indeterminate"
          onCheck={handleCheck}
        />
      </List>,
    );

    await user.click(screen.getByRole('checkbox', {name: 'Partial'}));
    expect(handleCheck).toHaveBeenCalledWith(true);
  });
});

describe('CheckboxListItem accessible name', () => {
  it('names the checkbox from a string label', () => {
    render(
      <CheckboxList label="Preferences" value={[]} onChange={() => {}}>
        <CheckboxListItem label="Option A" value="a" />
      </CheckboxList>,
    );
    expect(
      screen.getByRole('checkbox', {name: 'Option A'}),
    ).toBeInTheDocument();
  });

  it('names the checkbox from a conforming aria-label when the label is a ReactNode', () => {
    render(
      <CheckboxList label="Plans" value={[]} onChange={() => {}}>
        <CheckboxListItem
          label={
            <span>
              Pro plan <em>(recommended)</em>
            </span>
          }
          aria-label="Pro plan (recommended) option"
          value="pro"
        />
      </CheckboxList>,
    );
    expect(
      screen.getByRole('checkbox', {name: 'Pro plan (recommended) option'}),
    ).toBeInTheDocument();
  });

  it('links a ReactNode label to the checkbox control', () => {
    render(
      <CheckboxList label="Plans" value={[]} onChange={() => {}}>
        <CheckboxListItem
          label={
            <span>
              Pro plan <em>(recommended)</em>
            </span>
          }
          value="pro"
        />
      </CheckboxList>,
    );
    const checkbox = screen.getByRole('checkbox');
    const labelledBy = checkbox.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)).toHaveTextContent(
      'Pro plan (recommended)',
    );
  });

  it('does not reference the visible label when a conforming aria-label is given', () => {
    render(
      <CheckboxList label="Plans" value={[]} onChange={() => {}}>
        <CheckboxListItem
          label={<span>Pro plan</span>}
          aria-label="Pro plan option"
          value="pro"
        />
      </CheckboxList>,
    );
    const checkbox = screen.getByRole('checkbox', {name: 'Pro plan option'});
    expect(checkbox).not.toHaveAttribute('aria-labelledby');
  });
});

describe('CheckboxListItem ARIA props', () => {
  it('conveys checked state via the inner checkbox, not aria-checked on the listitem', () => {
    render(
      <CheckboxList label="Prefs" value={['a']} onChange={() => {}}>
        <CheckboxListItem label="Option A" value="a" />
        <CheckboxListItem label="Option B" value="b" />
      </CheckboxList>,
    );
    // The listitem row must not carry aria-checked (not a valid attribute on
    // role="listitem" — axe: aria-allowed-attr). Checked state is exposed by
    // the inner native checkbox instead.
    const items = screen.getAllByRole('listitem');
    expect(items[0]).not.toHaveAttribute('aria-checked');
    expect(items[1]).not.toHaveAttribute('aria-checked');

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();
  });

  it('does not put aria-checked on the listitem in standalone mode', () => {
    render(
      <List>
        <CheckboxListItem label="Done" isChecked={true} />
        <CheckboxListItem label="Todo" isChecked={false} />
      </List>,
    );
    const items = screen.getAllByRole('listitem');
    expect(items[0]).not.toHaveAttribute('aria-checked');
    expect(items[1]).not.toHaveAttribute('aria-checked');

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();
  });

  it('exposes indeterminate state via the checkbox, not aria-checked on the listitem', () => {
    render(
      <List>
        <CheckboxListItem label="Partial" isChecked="indeterminate" />
      </List>,
    );
    const item = screen.getByRole('listitem');
    expect(item).not.toHaveAttribute('aria-checked');
    const checkbox = screen.getByRole('checkbox');
    if (checkbox instanceof HTMLInputElement) {
      expect(checkbox.indeterminate).toBe(true);
    }
  });

  it('does not mark items aria-busy when idle', () => {
    render(
      <CheckboxList label="Prefs" value={['a']} onChange={() => {}}>
        <CheckboxListItem label="Option A" value="a" />
      </CheckboxList>,
    );
    const item = screen.getByRole('listitem');
    expect(item).not.toHaveAttribute('aria-busy');
  });

  it('marks the item aria-busy when item-level isLoading is set', () => {
    render(
      <CheckboxList label="Prefs" value={['a']} onChange={() => {}}>
        <CheckboxListItem label="Option A" value="a" isLoading />
        <CheckboxListItem label="Option B" value="b" />
      </CheckboxList>,
    );
    const [itemA, itemB] = screen.getAllByRole('listitem');
    expect(itemA).toHaveAttribute('aria-busy', 'true');
    // Loading is per-item — sibling items are unaffected.
    expect(itemB).not.toHaveAttribute('aria-busy');
  });

  it('renders a spinner inside the checkbox when item isLoading is set', () => {
    render(
      <CheckboxList label="Prefs" value={['a']} onChange={() => {}}>
        <CheckboxListItem label="Option A" value="a" isLoading />
      </CheckboxList>,
    );
    // The spinner is decorative — it lives inside the checkbox's
    // aria-hidden visual box, so query with hidden:true. The accessible
    // loading signal is `aria-busy` on the item (asserted above).
    expect(screen.getByRole('status', {hidden: true})).toBeInTheDocument();
  });

  it('does not toggle when item-level isLoading is set', () => {
    const onChange = vi.fn();
    render(
      <CheckboxList label="Prefs" value={[]} onChange={onChange}>
        <CheckboxListItem label="Option A" value="a" isLoading />
      </CheckboxList>,
    );
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows a spinner only on the toggled item while changeAction is pending', async () => {
    // changeAction returns a promise that never resolves, so the pending
    // (loading) state persists for assertions.
    const changeAction = vi.fn(async () => {
      await new Promise<void>(() => {});
    });
    render(
      <CheckboxList
        label="Prefs"
        value={[]}
        onChange={() => {}}
        changeAction={changeAction}>
        <CheckboxListItem label="Option A" value="a" />
        <CheckboxListItem label="Option B" value="b" />
      </CheckboxList>,
    );

    const [itemA, itemB] = screen.getAllByRole('listitem');
    // Toggle Option A.
    fireEvent.click(within(itemA).getByRole('checkbox'));

    // The toggled item becomes busy and shows a spinner; the sibling stays idle.
    // The spinner is decorative (inside the aria-hidden box), so query hidden.
    expect(
      await within(itemA).findByRole('status', {hidden: true}),
    ).toBeInTheDocument();
    expect(itemA).toHaveAttribute('aria-busy', 'true');
    expect(itemB).not.toHaveAttribute('aria-busy');
    expect(
      within(itemB).queryByRole('status', {hidden: true}),
    ).not.toBeInTheDocument();
    expect(changeAction).toHaveBeenCalledWith(['a']);
  });

  it('keeps a read-only item onClick while refusing every toggle', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onItemClick = vi.fn();
    render(
      <CheckboxList label="Prefs" value={[]} onChange={onChange} isReadOnly>
        <CheckboxListItem label="Option A" value="a" onClick={onItemClick} />
        <CheckboxListItem label="Option B" value="b" />
      </CheckboxList>,
    );
    const [itemA, itemB] = screen.getAllByRole('listitem');
    const checkboxA = within(itemA).getByRole('checkbox');
    const checkboxB = within(itemB).getByRole('checkbox');

    // With an onClick, a row-surface click still delegates to the checkbox.
    // The text also exists in the checkbox's visually hidden <label>; target
    // the row's label <span> to click the row surface.
    fireEvent.click(within(itemA).getByText('Option A', {selector: 'span'}));
    expect(onItemClick).toHaveBeenCalledTimes(1);
    fireEvent.click(checkboxA);
    expect(onItemClick).toHaveBeenCalledTimes(2);
    checkboxA.focus();
    await user.keyboard(' ');
    expect(onItemClick).toHaveBeenCalledTimes(3);
    expect(checkboxA).toHaveAttribute('aria-readonly', 'true');
    expect(checkboxA).not.toBeChecked();

    // Without one, the read-only row does not delegate at all.
    const delegated = vi.fn();
    checkboxB.addEventListener('click', delegated);
    fireEvent.click(within(itemB).getByText('Option B', {selector: 'span'}));
    expect(delegated).not.toHaveBeenCalled();
    fireEvent.click(checkboxB);
    expect(checkboxB).not.toBeChecked();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps an earlier toggled item busy and locked while its changeAction is still pending', async () => {
    // Never-resolving actions keep both toggles pending for the assertions.
    const changeAction = vi.fn(async () => {
      await new Promise<void>(() => {});
    });
    const onChange = vi.fn();
    render(
      <CheckboxList
        label="Prefs"
        value={[]}
        onChange={onChange}
        changeAction={changeAction}>
        <CheckboxListItem label="Option A" value="a" />
        <CheckboxListItem label="Option B" value="b" />
      </CheckboxList>,
    );

    const [itemA, itemB] = screen.getAllByRole('listitem');
    fireEvent.click(within(itemA).getByRole('checkbox'));
    await waitFor(() => expect(itemA).toHaveAttribute('aria-busy', 'true'));

    // Other items stay interactive, and toggling one must not clear the
    // pending state of the item that is still saving.
    fireEvent.click(within(itemB).getByRole('checkbox'));
    await waitFor(() => expect(itemB).toHaveAttribute('aria-busy', 'true'));
    expect(itemA).toHaveAttribute('aria-busy', 'true');
    expect(
      within(itemA).getByRole('status', {hidden: true}),
    ).toBeInTheDocument();

    // Re-toggling the still-pending item stays blocked.
    fireEvent.click(within(itemA).getByRole('checkbox'));
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(changeAction).toHaveBeenCalledTimes(2);
    expect(changeAction).toHaveBeenLastCalledWith(['a', 'b']);
  });

  it('forwards arbitrary aria attributes to the list item, but aria-label names the checkbox', () => {
    render(
      <List>
        <CheckboxListItem
          label="Custom aria"
          aria-describedby="help-text"
          aria-label="Custom aria label"
        />
      </List>,
    );
    const item = screen.getByRole('listitem');
    // Arbitrary aria-* still forward to the row...
    expect(item).toHaveAttribute('aria-describedby', 'help-text');
    // ...but aria-label names the checkbox control, not the row.
    expect(item).not.toHaveAttribute('aria-label');
    expect(
      screen.getByRole('checkbox', {name: 'Custom aria label'}),
    ).toBeInTheDocument();
  });

  describe('disabledMessage', () => {
    const h = {hidden: true} as const;

    function renderGroup(props?: {onChange?: (v: string[]) => void}) {
      return render(
        <CheckboxList
          label="Notifications"
          value={['email']}
          onChange={props?.onChange ?? (() => {})}
          isDisabled
          disabledMessage="Notifications are managed by your administrator">
          <CheckboxListItem label="Email" value="email" />
          <CheckboxListItem label="SMS" value="sms" />
        </CheckboxList>,
      );
    }

    it('shows the reason tooltip on hover when the group is disabled with a reason', async () => {
      renderGroup();
      const tooltip = screen.getByRole('tooltip', h);
      expect(tooltip).toHaveTextContent(
        'Notifications are managed by your administrator',
      );
      const group = screen.getByRole('group');
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
        <CheckboxList
          label="Notifications"
          value={['email']}
          onChange={() => {}}
          disabledMessage="Notifications are managed by your administrator">
          <CheckboxListItem label="Email" value="email" />
        </CheckboxList>,
      );
      expect(screen.queryByRole('tooltip', h)).not.toBeInTheDocument();
    });

    it('does not render a tooltip when disabled without a reason', () => {
      render(
        <CheckboxList
          label="Notifications"
          value={['email']}
          onChange={() => {}}
          isDisabled>
          <CheckboxListItem label="Email" value="email" />
        </CheckboxList>,
      );
      expect(screen.queryByRole('tooltip', h)).not.toBeInTheDocument();
    });

    it('keeps checkboxes focusable via aria-disabled when a reason is provided', () => {
      renderGroup();
      for (const checkbox of screen.getAllByRole('checkbox', h)) {
        expect(checkbox).not.toBeDisabled();
        expect(checkbox).toHaveAttribute('aria-disabled', 'true');
      }
    });

    it('links the reason tooltip from the group via aria-describedby', () => {
      renderGroup();
      const group = screen.getByRole('group');
      const tooltip = screen.getByRole('tooltip', h);
      expect(group.getAttribute('aria-describedby')).toContain(tooltip.id);
    });

    it('blocks toggling while focusable-disabled', () => {
      const onChange = vi.fn();
      renderGroup({onChange});
      const sms = screen.getByRole('checkbox', {name: 'SMS', hidden: true});
      fireEvent.click(sms);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('keeps checkboxes focusable via aria-disabled when disabled without a reason', () => {
      render(
        <CheckboxList
          label="Notifications"
          value={['email']}
          onChange={() => {}}
          isDisabled>
          <CheckboxListItem label="Email" value="email" />
          <CheckboxListItem label="SMS" value="sms" />
        </CheckboxList>,
      );
      for (const checkbox of screen.getAllByRole('checkbox', h)) {
        expect(checkbox).not.toHaveAttribute('disabled');
        expect(checkbox).toHaveAttribute('aria-disabled', 'true');
      }
    });
  });
});

describe('CheckboxListItem press surface', () => {
  const hoverScopeClass = stylex.props(indicatorScope).className ?? '';

  // A row that delegates its clicks owns its checkbox's press for every
  // pointer: a mouse and a pen press through the same controller as a finger
  // (spec:AST-094 FR11's fine-pointer profile, FR43).
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** The row's checkbox: its indicator wrapper and the control around it. */
  function parts(row: HTMLElement) {
    const box = row.querySelector('.astryx-checkbox-indicator');
    const wrapper = box?.parentElement?.parentElement;
    const control = wrapper?.parentElement;
    if (wrapper == null || control == null) {
      throw new Error('the row has no checkbox to press');
    }
    return {wrapper, control};
  }

  function rowOf(name: string): HTMLElement {
    const row = screen.getByRole('checkbox', {name}).closest('li');
    if (row == null) {
      throw new Error(`no row for ${name}`);
    }
    return row;
  }

  function classesOf(element: Element): string[] {
    return element.className.split(/\s+/);
  }

  it('makes the row the one press surface, so the label and the box press the same element', () => {
    render(
      <CheckboxList label="Notifications" value={['email']} onChange={() => {}}>
        <CheckboxListItem label="Email" value="email" />
        <CheckboxListItem label="SMS" value="sms" description="Rates apply" />
      </CheckboxList>,
    );
    expect(hoverScopeClass).not.toBe('');
    for (const name of ['Email', 'SMS']) {
      const row = rowOf(name);
      const {wrapper, control} = parts(row);
      // The touch press paints the innermost marked element under the
      // finger: with nothing marked inside the row, every point of it presses
      // the row.
      expect(row).toHaveAttribute('data-astryx-pressable');
      expect(row.querySelectorAll('[data-astryx-pressable]')).toHaveLength(0);
      expect(control).not.toHaveAttribute('data-astryx-pressable');
      // The row declares the press's image and release, so the layer over
      // the box paints the row's press at full strength and releases it by
      // its own opacity on the row's deselect clock, beside the row's own
      // press layer, both on the compositor.
      expect(declaresIndicatorPressOwner(row)).toBe(true);
      expect(readIndicatorPressLayer(wrapper, row)).toEqual({
        paintsOn: true,
        paintsFading: true,
        releases: true,
        releaseMs: [cellPressConsts.cellReleaseMs, 200],
        fillsBoth: true,
      });
      expect(readsPressStrength(wrapper)).toBe(false);
      // The row's own press layer (Item's cell `::before`) paints the pressed
      // token beside the box.
      expect(
        rulesDeclaredFor(row).some(
          rule =>
            rule.slice(0, rule.indexOf('{')).includes('::before') &&
            rule.includes('--color-overlay-pressed'),
        ),
      ).toBe(true);
      // The row-owned arms, release included, serve every pointer: none sits
      // behind a pointer query (spec:AST-094 FR43).
      expect(layerPressRulesBehindPointer(wrapper)).toEqual([]);
      expect(ownerPressRulesBehindPointer(row)).toEqual([]);
      // The box answers its own row only, never an outer row's press
      // (architecture:component-style-authoring INV4).
      expect(readsAncestorPress(wrapper)).toBe(false);
      // A mouse's hover stays the checkbox's own; its press is the row's,
      // through the controller, with no `:active` arm beside it.
      expect(classesOf(control)).toContain(hoverScopeClass);
      expect(classesOf(row)).not.toContain(hoverScopeClass);
      expect(hasPressedArm(wrapper)).toBe(false);
    }
  });

  it('makes a standalone row with a check handler its press surface too', () => {
    render(
      <List>
        <CheckboxListItem
          label="Accept terms"
          isChecked={false}
          onCheck={() => {}}
        />
      </List>,
    );
    const row = rowOf('Accept terms');
    expect(row).toHaveAttribute('data-astryx-pressable');
    expect(row.querySelectorAll('[data-astryx-pressable]')).toHaveLength(0);
    expect(declaresIndicatorPressOwner(row)).toBe(true);
  });

  it('makes the row the press surface on a fine-pointer page too (FR43)', () => {
    // A mouse or a pen on a fine-pointer page presses the row, as a finger
    // does (spec:AST-094 FR11's fine-pointer profile, FR43): the box carries
    // no press marker, so the row is the innermost pressable under the
    // pointer, and the box paints the row's press.
    stubMatchMedia({matches: false});
    render(
      <CheckboxList label="Notifications" value={['email']} onChange={() => {}}>
        <CheckboxListItem label="Email" value="email" />
      </CheckboxList>,
    );
    const row = rowOf('Email');
    const {wrapper, control} = parts(row);
    expect(row).toHaveAttribute('data-astryx-pressable');
    expect(control).not.toHaveAttribute('data-astryx-pressable');
    expect(declaresIndicatorPressOwner(row)).toBe(true);
    expect(hasPressedArm(wrapper)).toBe(false);
  });

  it('adds no pointer-query listener per row, on a fine pointer or a coarse one (FR24)', () => {
    // A repeated row reads no pointer of its own (spec:AST-094 FR24;
    // architecture:react-component-runtime INV7): forty rows hold no more
    // pointer-query listeners than one, and none outlives the list.
    for (const coarse of [false, true]) {
      let live = 0;
      const count = (query: string, delta: number) => {
        if (query.includes('pointer:')) {
          live += delta;
        }
      };
      vi.stubGlobal(
        'matchMedia',
        vi.fn((query: string) => ({
          matches: query.includes('pointer: coarse') ? coarse : false,
          media: query,
          onchange: null,
          addEventListener: () => count(query, 1),
          removeEventListener: () => count(query, -1),
          addListener: () => count(query, 1),
          removeListener: () => count(query, -1),
          dispatchEvent: () => false,
        })),
      );
      const listOf = (length: number) => (
        <CheckboxList label="Many" value={['v0']} onChange={() => {}}>
          {Array.from({length}, (_, index) => (
            <CheckboxListItem
              key={index}
              label={`Option ${index}`}
              value={`v${index}`}
            />
          ))}
        </CheckboxList>
      );
      const one = render(listOf(1));
      const forOne = live;
      one.unmount();
      const {unmount} = render(listOf(40));
      // Every row answers the same pointer-independent way: the row owns its
      // box's press, so the box carries no press marker.
      const {control} = parts(rowOf('Option 3'));
      expect(control.hasAttribute('data-astryx-pressable')).toBe(false);
      expect(live).toBe(forOne);
      unmount();
      expect(live).toBe(0);
      vi.unstubAllGlobals();
    }
  });

  it('leaves a row that does not respond to presses out of it', () => {
    // A standalone row with no check handler delegates nothing, so its
    // checkbox keeps its own press.
    render(
      <List>
        <CheckboxListItem label="Completed task" isChecked />
      </List>,
    );
    const row = rowOf('Completed task');
    const {control} = parts(row);
    expect(row).not.toHaveAttribute('data-astryx-pressable');
    expect(control).toHaveAttribute('data-astryx-pressable');
    expect(declaresIndicatorPressOwner(row)).toBe(false);
    expect(declaresIndicatorPressOwner(control)).toBe(true);
  });

  it('paints no press on a disabled item', () => {
    render(
      <CheckboxList label="Notifications" value={[]} onChange={() => {}}>
        <CheckboxListItem label="Email" value="email" isDisabled />
      </CheckboxList>,
    );
    const row = rowOf('Email');
    const {wrapper, control} = parts(row);
    expect(row.querySelectorAll('[data-astryx-pressable]')).toHaveLength(0);
    expect(control).not.toHaveAttribute('data-astryx-pressable');
    expect(declaresIndicatorPressOwner(row)).toBe(false);
    expect(readsIndicatorPress(wrapper)).toBe(false);
    expect(hasPressedArm(wrapper)).toBe(false);
  });

  it('paints no press anywhere in a read-only group, whose values cannot change', () => {
    render(
      <CheckboxList
        label="Notifications"
        value={['email']}
        onChange={() => {}}
        isReadOnly>
        <CheckboxListItem label="Email" value="email" />
        <CheckboxListItem label="SMS" value="sms" />
      </CheckboxList>,
    );
    for (const name of ['Email', 'SMS']) {
      const row = rowOf(name);
      const {wrapper} = parts(row);
      expect(row).not.toHaveAttribute('data-astryx-pressable');
      expect(row.querySelectorAll('[data-astryx-pressable]')).toHaveLength(0);
      expect(hasPressedArm(wrapper)).toBe(false);
      expect(readsIndicatorPress(wrapper)).toBe(false);
    }
  });

  it('lets a read-only row with its own click handler press, but not its box', () => {
    // The row still responds (the consumer's handler runs), so it keeps its
    // press; the box's value cannot change, so it paints nothing.
    render(
      <CheckboxList
        label="Notifications"
        value={['email']}
        onChange={() => {}}
        isReadOnly>
        <CheckboxListItem label="Email" value="email" onClick={() => {}} />
      </CheckboxList>,
    );
    const row = rowOf('Email');
    const {wrapper, control} = parts(row);
    expect(row).toHaveAttribute('data-astryx-pressable');
    expect(control).not.toHaveAttribute('data-astryx-pressable');
    expect(hasPressedArm(wrapper)).toBe(false);
    expect(readsIndicatorPress(wrapper)).toBe(false);
  });

  it("keeps a checkbox placed in the row's content its own press surface", () => {
    render(
      <CheckboxList label="Notifications" value={[]} onChange={() => {}}>
        <CheckboxListItem
          label="Email"
          value="email"
          endContent={
            <CheckboxInput
              label="Daily digest"
              value={false}
              onChange={() => {}}
            />
          }
        />
      </CheckboxList>,
    );
    const nested = screen.getByRole('checkbox', {name: 'Daily digest'});
    const nestedSurface = nested.closest('[data-astryx-pressable]');
    expect(nestedSurface).not.toBeNull();
    expect(nestedSurface?.tagName).not.toBe('LI');
  });
});
