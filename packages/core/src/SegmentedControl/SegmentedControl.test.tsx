// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SegmentedControl.test.tsx
 * @input Uses vitest, @testing-library/react, SegmentedControl components
 * @output Component-specific callback, composition, layout, optional-key, and
 *   styling tests. Shared radio-group role, name, state, focus, and adopted
 *   interactions live in RadioList/__tests__/RadioGroup.a11y.*.
 * @position Component-owned regression tests that do not duplicate the reusable
 *   radio-group contract.
 *
 * SYNC: When SegmentedControl components change, update tests to match new behavior
 */

import {describe, it, expect, vi, beforeEach} from 'vitest';
import {render, screen, fireEvent, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {hasPressedArm} from '../__tests__/pressState';
import {SegmentedControl} from './SegmentedControl';
import {SegmentedControlItem} from './SegmentedControlItem';
import {
  getAllInjectedCss,
  getForcedColorsRules,
} from '../__tests__/forcedColors';

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

describe('SegmentedControl', () => {
  it('calls onChange when an item is clicked', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <SegmentedControl value="grid" onChange={handleChange} label="View mode">
        <SegmentedControlItem value="grid" label="Grid" />
        <SegmentedControlItem value="list" label="List" />
      </SegmentedControl>,
    );

    await user.click(screen.getByRole('radio', {name: 'List'}));
    expect(handleChange).toHaveBeenCalledWith('list');
  });

  it('does not call onChange when clicking the already-selected item', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <SegmentedControl value="grid" onChange={handleChange} label="View mode">
        <SegmentedControlItem value="grid" label="Grid" />
        <SegmentedControlItem value="list" label="List" />
      </SegmentedControl>,
    );

    await user.click(screen.getByRole('radio', {name: 'Grid'}));
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('updates aria-checked when value changes', () => {
    const {rerender} = render(
      <SegmentedControl value="grid" onChange={() => {}} label="View mode">
        <SegmentedControlItem value="grid" label="Grid" />
        <SegmentedControlItem value="list" label="List" />
      </SegmentedControl>,
    );

    expect(screen.getByRole('radio', {name: 'Grid'})).toHaveAttribute(
      'aria-checked',
      'true',
    );

    rerender(
      <SegmentedControl value="list" onChange={() => {}} label="View mode">
        <SegmentedControlItem value="grid" label="Grid" />
        <SegmentedControlItem value="list" label="List" />
      </SegmentedControl>,
    );

    expect(screen.getByRole('radio', {name: 'Grid'})).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(screen.getByRole('radio', {name: 'List'})).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('renders with different sizes', () => {
    const {rerender} = render(
      <SegmentedControl
        value="grid"
        onChange={() => {}}
        label="View mode"
        size="sm">
        <SegmentedControlItem value="grid" label="Grid" />
      </SegmentedControl>,
    );
    expect(screen.getByRole('radio', {name: 'Grid'})).toBeInTheDocument();

    rerender(
      <SegmentedControl
        value="grid"
        onChange={() => {}}
        label="View mode"
        size="lg">
        <SegmentedControlItem value="grid" label="Grid" />
      </SegmentedControl>,
    );
    expect(screen.getByRole('radio', {name: 'Grid'})).toBeInTheDocument();
  });

  it('renders item with icon', () => {
    render(
      <SegmentedControl value="grid" onChange={() => {}} label="View mode">
        <SegmentedControlItem
          value="grid"
          label="Grid"
          icon={<span data-testid="icon">G</span>}
        />
      </SegmentedControl>,
    );

    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('renders icon-only item with aria-label from label prop', () => {
    render(
      <SegmentedControl value="grid" onChange={() => {}} label="View mode">
        <SegmentedControlItem
          value="grid"
          label="Grid view"
          isLabelHidden
          icon={<span data-testid="icon">G</span>}
        />
      </SegmentedControl>,
    );

    const radio = screen.getByRole('radio', {name: 'Grid view'});
    expect(radio).toBeInTheDocument();
    expect(radio).toHaveAttribute('aria-label', 'Grid view');
    // Label text should not be visible
    expect(screen.queryByText('Grid view')).not.toBeInTheDocument();
  });

  it('keeps hug layout content-sized inside a stretching flex parent', () => {
    render(
      <div style={{display: 'flex', flexDirection: 'column'}}>
        <SegmentedControl value="grid" onChange={() => {}} label="View mode">
          <SegmentedControlItem value="grid" label="Grid" />
          <SegmentedControlItem value="list" label="List" />
        </SegmentedControl>
      </div>,
    );

    expect(getComputedStyle(screen.getByRole('radiogroup')).width).toBe(
      'fit-content',
    );
  });

  it('fill layout overrides the intrinsic control width', () => {
    render(
      <SegmentedControl
        value="grid"
        onChange={() => {}}
        label="View mode"
        layout="fill">
        <SegmentedControlItem value="grid" label="Grid" />
        <SegmentedControlItem value="list" label="List" />
      </SegmentedControl>,
    );

    expect(getComputedStyle(screen.getByRole('radiogroup')).width).toBe('100%');
  });

  it('fill items can shrink and truncate long labels', () => {
    render(
      <SegmentedControl
        value="grid"
        onChange={() => {}}
        label="View mode"
        layout="fill">
        <SegmentedControlItem
          value="grid"
          label="A very long segment label that should truncate"
        />
        <SegmentedControlItem value="list" label="List" />
        <SegmentedControlItem value="table" label="Table" />
      </SegmentedControl>,
    );

    const button = screen.getByRole('radio', {name: /very long/});
    const label = screen.getByText(
      'A very long segment label that should truncate',
    );

    // The button (flex child) must allow shrinking below content size
    const buttonStyle = getComputedStyle(button);
    expect(buttonStyle.minWidth).toBe('0');

    // The label span must set up text truncation
    const labelStyle = getComputedStyle(label);
    expect(labelStyle.overflow).toBe('hidden');
    expect(labelStyle.textOverflow).toBe('ellipsis');
  });

  it('caps the hug layout at its container and lets segments truncate', () => {
    render(
      <SegmentedControl value="grid" onChange={() => {}} label="View mode">
        <SegmentedControlItem
          value="grid"
          label="A very long segment label that should truncate"
        />
        <SegmentedControlItem value="list" label="List" />
        <SegmentedControlItem
          value="icon"
          label="Icon"
          icon={<span>*</span>}
          isLabelHidden
        />
      </SegmentedControl>,
    );

    const group = getComputedStyle(screen.getByRole('radiogroup'));
    expect(group.width).toBe('fit-content');
    expect(group.maxWidth).toBe('100%');
    expect(group.minWidth).toBe('0');

    const segment = screen.getByRole('radio', {name: /very long/});
    expect(getComputedStyle(segment).minWidth).toBe('0');
    expect(getComputedStyle(segment).flexShrink).not.toBe('0');

    // Icon-only segments have nothing to truncate and keep their size.
    const iconOnly = screen.getByRole('radio', {name: 'Icon'});
    expect(getComputedStyle(iconOnly).flexShrink).toBe('0');
  });

  it('keeps the content-sized hug layout from #6643 while adding the cap', () => {
    // #6643 stops a stretching column from widening hug; the cap must not
    // undo that. Both declarations coexist: fit-content sizes it, the cap
    // only applies when the container is narrower than the content.
    render(
      <div style={{display: 'flex', flexDirection: 'column'}}>
        <SegmentedControl value="grid" onChange={() => {}} label="View mode">
          <SegmentedControlItem value="grid" label="Grid" />
          <SegmentedControlItem value="list" label="List" />
        </SegmentedControl>
      </div>,
    );
    const group = getComputedStyle(screen.getByRole('radiogroup'));
    expect(group.width).toBe('fit-content');
    expect(group.maxWidth).toBe('100%');
    expect(group.display).toBe('inline-flex');
  });

  it('lets a fill control yield to a narrow row too', () => {
    render(
      <SegmentedControl
        value="grid"
        onChange={() => {}}
        label="View mode"
        layout="fill">
        <SegmentedControlItem value="grid" label="Grid" />
        <SegmentedControlItem value="list" label="List" />
      </SegmentedControl>,
    );
    const group = getComputedStyle(screen.getByRole('radiogroup'));
    expect(group.width).toBe('100%');
    expect(group.minWidth).toBe('0');
    expect(group.maxWidth).toBe('100%');
  });

  it('truncates the label of an icon-and-label segment but keeps its icon', () => {
    render(
      <SegmentedControl value="grid" onChange={() => {}} label="View mode">
        <SegmentedControlItem
          value="grid"
          label="Grid with thumbnails and captions"
          icon={<span data-testid="grid-icon">#</span>}
        />
        <SegmentedControlItem value="list" label="List" />
      </SegmentedControl>,
    );
    const segment = screen.getByRole('radio', {name: /Grid with/});
    expect(getComputedStyle(segment).minWidth).toBe('0');
    // Icon + label is not icon-only: the segment itself still shrinks.
    expect(getComputedStyle(segment).flexShrink).not.toBe('0');
    const iconWrapper = screen.getByTestId('grid-icon').parentElement!;
    expect(getComputedStyle(iconWrapper).flexShrink).toBe('0');
    const label = screen.getByText('Grid with thumbnails and captions');
    expect(getComputedStyle(label).textOverflow).toBe('ellipsis');
  });

  it('does not cap a control whose segments are all icon-only', () => {
    // Nothing in it can shrink, so a cap would only leave the last segments
    // hanging outside the control's track in a too-narrow container.
    render(
      <SegmentedControl value="list" onChange={() => {}} label="View mode">
        <SegmentedControlItem
          value="list"
          label="List"
          icon={<span>=</span>}
          isLabelHidden
        />
        <SegmentedControlItem
          value="board"
          label="Board"
          icon={<span>#</span>}
          isLabelHidden
        />
      </SegmentedControl>,
    );
    const group = getComputedStyle(screen.getByRole('radiogroup'));
    expect(group.width).toBe('fit-content');
    expect(group.maxWidth).toBe('none');
    // No min-size reset either, so a flex row cannot squeeze it.
    expect(group.minWidth).toBe('auto');
    for (const radio of screen.getAllByRole('radio')) {
      expect(getComputedStyle(radio).flexShrink).toBe('0');
    }
  });

  it('promotes the first enabled item when the value matches no item and the first is disabled', () => {
    render(
      <SegmentedControl
        value="nonexistent"
        onChange={() => {}}
        label="View mode">
        <SegmentedControlItem value="grid" label="Grid" isDisabled />
        <SegmentedControlItem value="list" label="List" />
        <SegmentedControlItem value="table" label="Table" />
      </SegmentedControl>,
    );

    // The disabled first item is skipped; the first ENABLED radio is tabbable.
    expect(screen.getByRole('radio', {name: 'List'})).toHaveAttribute(
      'tabIndex',
      '0',
    );
  });
});

describe('SegmentedControl keyboard navigation', () => {
  describe('tab-through is a pure focus move (#3597)', () => {
    it('does not fire onChange when tabbing in with an unmatched value', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <>
          <button type="button">before</button>
          <SegmentedControl label="View" value="archived" onChange={onChange}>
            <SegmentedControlItem value="grid" label="Grid" />
            <SegmentedControlItem value="list" label="List" />
          </SegmentedControl>
        </>,
      );
      screen.getByText('before').focus();
      await user.tab();
      expect(onChange).not.toHaveBeenCalled();
    });

    it('does not fire onChange when tabbing in while the selected item is disabled', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <>
          <button type="button">before</button>
          <SegmentedControl label="View" value="list" onChange={onChange}>
            <SegmentedControlItem value="grid" label="Grid" />
            <SegmentedControlItem value="list" label="List" isDisabled />
          </SegmentedControl>
        </>,
      );
      screen.getByText('before').focus();
      await user.tab();
      expect(onChange).not.toHaveBeenCalled();
    });

    it('still selects on arrow-key navigation within the group', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <SegmentedControl label="View" value="grid" onChange={onChange}>
          <SegmentedControlItem value="grid" label="Grid" />
          <SegmentedControlItem value="list" label="List" />
        </SegmentedControl>,
      );
      screen.getByRole('radio', {name: 'Grid'}).focus();
      await user.keyboard('{ArrowRight}');
      expect(onChange).toHaveBeenCalledWith('list');
    });
  });

  it('navigates with ArrowRight and selects', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <SegmentedControl value="grid" onChange={handleChange} label="View mode">
        <SegmentedControlItem value="grid" label="Grid" />
        <SegmentedControlItem value="list" label="List" />
        <SegmentedControlItem value="table" label="Table" />
      </SegmentedControl>,
    );

    screen.getByRole('radio', {name: 'Grid'}).focus();
    await user.keyboard('{ArrowRight}');

    expect(handleChange).toHaveBeenCalledWith('list');
  });

  it('navigates with ArrowLeft and selects', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <SegmentedControl value="list" onChange={handleChange} label="View mode">
        <SegmentedControlItem value="grid" label="Grid" />
        <SegmentedControlItem value="list" label="List" />
        <SegmentedControlItem value="table" label="Table" />
      </SegmentedControl>,
    );

    screen.getByRole('radio', {name: 'List'}).focus();
    await user.keyboard('{ArrowLeft}');

    expect(handleChange).toHaveBeenCalledWith('grid');
  });

  it('wraps around from last to first with ArrowRight', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <SegmentedControl value="table" onChange={handleChange} label="View mode">
        <SegmentedControlItem value="grid" label="Grid" />
        <SegmentedControlItem value="list" label="List" />
        <SegmentedControlItem value="table" label="Table" />
      </SegmentedControl>,
    );

    screen.getByRole('radio', {name: 'Table'}).focus();
    await user.keyboard('{ArrowRight}');

    expect(handleChange).toHaveBeenCalledWith('grid');
  });

  it('wraps around from first to last with ArrowLeft', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <SegmentedControl value="grid" onChange={handleChange} label="View mode">
        <SegmentedControlItem value="grid" label="Grid" />
        <SegmentedControlItem value="list" label="List" />
        <SegmentedControlItem value="table" label="Table" />
      </SegmentedControl>,
    );

    screen.getByRole('radio', {name: 'Grid'}).focus();
    await user.keyboard('{ArrowLeft}');

    expect(handleChange).toHaveBeenCalledWith('table');
  });

  it('Home key focuses first item', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <SegmentedControl value="table" onChange={handleChange} label="View mode">
        <SegmentedControlItem value="grid" label="Grid" />
        <SegmentedControlItem value="list" label="List" />
        <SegmentedControlItem value="table" label="Table" />
      </SegmentedControl>,
    );

    screen.getByRole('radio', {name: 'Table'}).focus();
    await user.keyboard('{Home}');

    expect(handleChange).toHaveBeenCalledWith('grid');
    expect(screen.getByRole('radio', {name: 'Grid'})).toHaveFocus();
  });

  it('End key focuses last item', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <SegmentedControl value="grid" onChange={handleChange} label="View mode">
        <SegmentedControlItem value="grid" label="Grid" />
        <SegmentedControlItem value="list" label="List" />
        <SegmentedControlItem value="table" label="Table" />
      </SegmentedControl>,
    );

    screen.getByRole('radio', {name: 'Grid'}).focus();
    await user.keyboard('{End}');

    expect(handleChange).toHaveBeenCalledWith('table');
    expect(screen.getByRole('radio', {name: 'Table'})).toHaveFocus();
  });
});

describe('SegmentedControl disabled state', () => {
  it('does not call onChange when group is disabled', async () => {
    const user = userEvent.setup({pointerEventsCheck: 0});
    const handleChange = vi.fn();

    render(
      <SegmentedControl
        value="grid"
        onChange={handleChange}
        label="View mode"
        isDisabled>
        <SegmentedControlItem value="grid" label="Grid" />
        <SegmentedControlItem value="list" label="List" />
      </SegmentedControl>,
    );

    await user.click(screen.getByRole('radio', {name: 'List'}));
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('disables individual items', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <SegmentedControl value="grid" onChange={handleChange} label="View mode">
        <SegmentedControlItem value="grid" label="Grid" />
        <SegmentedControlItem value="list" label="List" isDisabled />
      </SegmentedControl>,
    );

    await user.click(screen.getByRole('radio', {name: 'List'}));
    expect(handleChange).not.toHaveBeenCalled();
  });

  it("does not run a caller's onClick on a disabled segment", async () => {
    const user = userEvent.setup({pointerEventsCheck: 0});
    const handleClick = vi.fn();
    const handleChange = vi.fn();

    render(
      <SegmentedControl value="grid" onChange={handleChange} label="View mode">
        <SegmentedControlItem value="grid" label="Grid" />
        <SegmentedControlItem
          value="list"
          label="List"
          isDisabled
          onClick={handleClick}
        />
      </SegmentedControl>,
    );

    await user.click(screen.getByRole('radio', {name: 'List'}));
    expect(handleClick).not.toHaveBeenCalled();
    expect(handleChange).not.toHaveBeenCalled();
  });

  it("does not run a caller's onClick when the whole group is disabled", async () => {
    const user = userEvent.setup({pointerEventsCheck: 0});
    const handleClick = vi.fn();

    render(
      <SegmentedControl
        value="grid"
        onChange={() => {}}
        label="View mode"
        isDisabled>
        <SegmentedControlItem value="grid" label="Grid" />
        <SegmentedControlItem value="list" label="List" onClick={handleClick} />
      </SegmentedControl>,
    );

    await user.click(screen.getByRole('radio', {name: 'List'}));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it("does not run a caller's onClick on a focusable disabled segment", async () => {
    // A group disabled with a reason keeps its selected segment in the tab
    // order, so Enter and Space can reach it and synthesize a click.
    const user = userEvent.setup({pointerEventsCheck: 0});
    const handleClick = vi.fn();

    render(
      <SegmentedControl
        value="grid"
        onChange={() => {}}
        label="View mode"
        isDisabled
        disabledMessage="Choose a project to switch views">
        <SegmentedControlItem value="grid" label="Grid" onClick={handleClick} />
        <SegmentedControlItem value="list" label="List" />
      </SegmentedControl>,
    );

    const selected = screen.getByRole('radio', {name: 'Grid'});
    selected.focus();
    expect(selected).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(handleClick).not.toHaveBeenCalled();
  });

  it("still runs a caller's onClick on an enabled segment", async () => {
    const user = userEvent.setup({pointerEventsCheck: 0});
    const handleClick = vi.fn();
    const handleChange = vi.fn();

    render(
      <SegmentedControl value="grid" onChange={handleChange} label="View mode">
        <SegmentedControlItem value="grid" label="Grid" />
        <SegmentedControlItem value="list" label="List" onClick={handleClick} />
      </SegmentedControl>,
    );

    await user.click(screen.getByRole('radio', {name: 'List'}));
    expect(handleClick).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith('list');
  });

  it('skips disabled items during keyboard navigation', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <SegmentedControl value="grid" onChange={handleChange} label="View mode">
        <SegmentedControlItem value="grid" label="Grid" />
        <SegmentedControlItem value="list" label="List" isDisabled />
        <SegmentedControlItem value="table" label="Table" />
      </SegmentedControl>,
    );

    screen.getByRole('radio', {name: 'Grid'}).focus();
    await user.keyboard('{ArrowRight}');

    // Should skip disabled "List" and go to "Table"
    expect(handleChange).toHaveBeenCalledWith('table');
    expect(screen.getByRole('radio', {name: 'Table'})).toHaveFocus();
  });

  describe('disabledMessage', () => {
    const h = {hidden: true} as const;

    function renderControl(props?: {onChange?: (v: string) => void}) {
      return render(
        <SegmentedControl
          value="grid"
          onChange={props?.onChange ?? (() => {})}
          label="View mode"
          isDisabled
          disabledMessage="Choose a project to switch views">
          <SegmentedControlItem value="grid" label="Grid" />
          <SegmentedControlItem value="list" label="List" />
        </SegmentedControl>,
      );
    }

    it('shows the reason tooltip on hover when the control is disabled with a reason', async () => {
      renderControl();
      const tooltip = screen.getByRole('tooltip', h);
      expect(tooltip).toHaveTextContent('Choose a project to switch views');
      const group = screen.getByRole('radiogroup');
      fireEvent.mouseEnter(group);
      await waitFor(() => expect(tooltip).toHaveAttribute('popover-open'));
      fireEvent.mouseLeave(group);
      await waitFor(() => expect(tooltip).not.toHaveAttribute('popover-open'));
    });

    it('shows the reason tooltip on keyboard focus', async () => {
      const user = userEvent.setup();
      renderControl();
      const tooltip = screen.getByRole('tooltip', h);
      await user.tab();
      await waitFor(() => expect(tooltip).toHaveAttribute('popover-open'));
    });

    it('does not render a tooltip when not disabled', () => {
      render(
        <SegmentedControl
          value="grid"
          onChange={() => {}}
          label="View mode"
          disabledMessage="Choose a project to switch views">
          <SegmentedControlItem value="grid" label="Grid" />
        </SegmentedControl>,
      );
      expect(screen.queryByRole('tooltip', h)).not.toBeInTheDocument();
    });

    it('does not render a tooltip when disabled without a reason', () => {
      render(
        <SegmentedControl
          value="grid"
          onChange={() => {}}
          label="View mode"
          isDisabled>
          <SegmentedControlItem value="grid" label="Grid" />
        </SegmentedControl>,
      );
      expect(screen.queryByRole('tooltip', h)).not.toBeInTheDocument();
    });

    it('blocks selection while focusable-disabled', () => {
      const onChange = vi.fn();
      renderControl({onChange});
      const list = screen.getByRole('radio', {name: 'List', hidden: true});
      fireEvent.click(list);
      expect(onChange).not.toHaveBeenCalled();
    });
  });
});

describe('SegmentedControl data-testid forwarding', () => {
  it('forwards data-testid to the radiogroup', () => {
    render(
      <SegmentedControl
        value="grid"
        onChange={() => {}}
        label="View mode"
        data-testid="view-toggle">
        <SegmentedControlItem value="grid" label="Grid" />
        <SegmentedControlItem value="list" label="List" />
      </SegmentedControl>,
    );

    expect(screen.getByTestId('view-toggle')).toBe(
      screen.getByRole('radiogroup'),
    );
  });

  it('forwards data-testid to an individual item button', () => {
    render(
      <SegmentedControl value="grid" onChange={() => {}} label="View mode">
        <SegmentedControlItem
          value="grid"
          label="Grid"
          data-testid="opt-grid"
        />
        <SegmentedControlItem
          value="list"
          label="List"
          data-testid="opt-list"
        />
      </SegmentedControl>,
    );

    expect(screen.getByTestId('opt-grid')).toBe(
      screen.getByRole('radio', {name: 'Grid'}),
    );
    expect(screen.getByTestId('opt-list')).toBe(
      screen.getByRole('radio', {name: 'List'}),
    );
  });

  it('does not let a forwarded prop override the computed role', () => {
    render(
      // A consumer-supplied role must not clobber the component's own
      // radiogroup role (the computed role is applied after {...rest}).
      <SegmentedControl
        value="grid"
        onChange={() => {}}
        label="View mode"
        role="tablist"
        data-testid="view-toggle">
        <SegmentedControlItem value="grid" label="Grid" />
      </SegmentedControl>,
    );

    expect(screen.getByTestId('view-toggle')).toHaveAttribute(
      'role',
      'radiogroup',
    );
  });
});

describe('SegmentedControlItem onClick composition', () => {
  it('calls a consumer onClick in addition to selecting the item', () => {
    const onChange = vi.fn();
    const onClick = vi.fn();
    render(
      <SegmentedControl value="grid" onChange={onChange} label="View mode">
        <SegmentedControlItem value="list" label="List" onClick={onClick} />
      </SegmentedControl>,
    );

    fireEvent.click(screen.getByRole('radio', {name: 'List'}));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('list');
  });

  it('lets a consumer onClick opt out of selection via preventDefault', () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl value="grid" onChange={onChange} label="View mode">
        <SegmentedControlItem
          value="list"
          label="List"
          onClick={e => e.preventDefault()}
        />
      </SegmentedControl>,
    );

    fireEvent.click(screen.getByRole('radio', {name: 'List'}));

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('SegmentedControl container handler forwarding', () => {
  it('forwards a consumer onKeyDown while keeping arrow-key navigation', async () => {
    const user = userEvent.setup();
    const onKeyDown = vi.fn();
    const onChange = vi.fn();
    render(
      <SegmentedControl
        value="grid"
        onChange={onChange}
        label="View mode"
        onKeyDown={onKeyDown}>
        <SegmentedControlItem value="grid" label="Grid" />
        <SegmentedControlItem value="list" label="List" />
      </SegmentedControl>,
    );

    screen.getByRole('radio', {name: 'Grid'}).focus();
    await user.keyboard('{ArrowRight}');

    expect(onKeyDown).toHaveBeenCalled();
    // Built-in navigation still ran.
    expect(onChange).toHaveBeenCalledWith('list');
  });

  it('lets a consumer onKeyDown opt out of built-in navigation via preventDefault', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SegmentedControl
        value="grid"
        onChange={onChange}
        label="View mode"
        onKeyDown={e => e.preventDefault()}>
        <SegmentedControlItem value="grid" label="Grid" />
        <SegmentedControlItem value="list" label="List" />
      </SegmentedControl>,
    );

    screen.getByRole('radio', {name: 'Grid'}).focus();
    await user.keyboard('{ArrowRight}');

    expect(onChange).not.toHaveBeenCalled();
  });
});

// jsdom cannot emulate forced-colors rendering, so these assert that the
// compiled output includes the forced-colors rules; visual behavior needs
// manual verification under Windows High Contrast.
describe('forced colors (WCAG 1.4.11)', () => {
  it('compiles forced-colors overrides so the selected segment survives Windows High Contrast', () => {
    render(
      <SegmentedControl value="grid" onChange={() => {}} label="View mode">
        <SegmentedControlItem value="grid" label="Grid" />
        <SegmentedControlItem value="list" label="List" />
      </SegmentedControl>,
    );
    const css = getForcedColorsRules();
    // The painted surface fill and shadow are stripped; Highlight/
    // HighlightText marks the selected segment.
    expect(css).toContain('background-color: highlight;');
    expect(css).toContain('color: highlighttext;');
    // The segment is a <button>; without opting out of UA remapping it keeps
    // the native ButtonFace surface and ignores the Highlight fill, leaving
    // HighlightText text on a white surface. forced-color-adjust: none makes
    // both render as authored.
    expect(getAllInjectedCss()).toContain('forced-color-adjust: none;');
  });
});

describe('pressed state', () => {
  it('paints the pressed overlay on a segment while it is pressed', () => {
    render(
      <SegmentedControl value="grid" onChange={() => {}} label="View mode">
        <SegmentedControlItem value="grid" label="Grid" />
        <SegmentedControlItem value="list" label="List" />
      </SegmentedControl>,
    );
    // The unselected segment is the one a press can change; it carries the
    // system's hover and pressed overlay.
    expect(hasPressedArm(screen.getByRole('radio', {name: 'List'}))).toBe(true);
    // The selected segment keeps its raised surface as it is.
    expect(hasPressedArm(screen.getByRole('radio', {name: 'Grid'}))).toBe(
      false,
    );
  });

  it('does not press a disabled segment', () => {
    render(
      <SegmentedControl value="grid" onChange={() => {}} label="View mode">
        <SegmentedControlItem value="grid" label="Grid" />
        <SegmentedControlItem value="list" label="List" isDisabled />
      </SegmentedControl>,
    );
    expect(hasPressedArm(screen.getByRole('radio', {name: 'List'}))).toBe(
      false,
    );
  });
});

describe("SegmentedControl keeps a caller's aria-describedby", () => {
  it('describes the radiogroup by the caller ids', () => {
    render(
      <>
        <span id="caller-help">Applies to every board</span>
        <SegmentedControl
          value="grid"
          onChange={() => {}}
          label="View mode"
          aria-describedby="caller-help">
          <SegmentedControlItem value="grid" label="Grid" />
        </SegmentedControl>
      </>,
    );
    expect(screen.getByRole('radiogroup')).toHaveAccessibleDescription(
      'Applies to every board',
    );
  });

  it('describes the disabled radiogroup by the caller ids and then the reason', () => {
    render(
      <>
        <span id="caller-help">Applies to every board</span>
        <SegmentedControl
          value="grid"
          onChange={() => {}}
          label="View mode"
          isDisabled
          disabledMessage="Choose a project to switch views"
          aria-describedby="caller-help">
          <SegmentedControlItem value="grid" label="Grid" />
        </SegmentedControl>
      </>,
    );
    const ids = screen
      .getByRole('radiogroup')
      .getAttribute('aria-describedby')
      ?.split(' ');
    expect(ids).toHaveLength(2);
    expect(ids?.[0]).toBe('caller-help');
    expect(document.getElementById(ids?.[1] ?? '')).toHaveTextContent(
      'Choose a project to switch views',
    );
  });
});
