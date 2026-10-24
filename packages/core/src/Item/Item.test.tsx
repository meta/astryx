// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Item.test.tsx
 * @input Uses vitest, @testing-library/react, Item component
 * @output Unit tests for Item
 * @position Testing; validates Item component implementation
 *
 * SYNC: When Item component changes, update tests to match new behavior
 */

import {use, useRef} from 'react';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import {rulesDeclaredFor} from '../__tests__/pressState';
import userEvent from '@testing-library/user-event';
import {Item} from './Item';
import {ItemDescriptionContext} from './ItemDescriptionContext';

/**
 * Item in delegation mode: `interactiveRef` points at a nested control that
 * owns the row's keyboard access and action. The row is an enlarged tap target
 * that forwards surface clicks to that control (useClickableContainer).
 */
function DelegatingItem({onToggle}: {onToggle?: () => void}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <Item
      label="Row"
      interactiveRef={ref}
      startContent={
        <input
          ref={ref}
          type="checkbox"
          aria-label="Pick row"
          onChange={onToggle}
        />
      }
    />
  );
}

describe('Item', () => {
  // ===========================================================================
  // Basic rendering
  // ===========================================================================

  it('ids the rendered description and publishes it to slot content', () => {
    function Probe() {
      const describedBy = use(ItemDescriptionContext);
      return <span data-testid="probe">{describedBy ?? 'none'}</span>;
    }
    render(
      <Item
        label="Email"
        description="Receive notifications by email"
        startContent={<Probe />}
      />,
    );
    const description = screen.getByText('Receive notifications by email');
    expect(description.id).not.toBe('');
    expect(screen.getByTestId('probe')).toHaveTextContent(description.id);
    // The string description stays Item's own element. Wrapping it to carry an
    // id would make it a ReactNode and drop the single-line truncation.
    expect(description.children).toHaveLength(0);
  });

  it('publishes no description id when the description renders nothing', () => {
    function Probe() {
      const describedBy = use(ItemDescriptionContext);
      return <span data-testid="probe">{describedBy ?? 'none'}</span>;
    }
    for (const description of ['', false] as const) {
      const {unmount} = render(
        <Item
          label="Email"
          description={description}
          startContent={<Probe />}
        />,
      );
      expect(screen.getByTestId('probe')).toHaveTextContent('none');
      unmount();
    }
  });

  it('renders label text', () => {
    render(<Item label="Contact Name" />);
    expect(screen.getByText('Contact Name')).toBeInTheDocument();
  });

  it('renders label and description', () => {
    render(<Item label="Settings" description="Manage your preferences" />);
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Manage your preferences')).toBeInTheDocument();
  });

  it('renders marker', () => {
    render(<Item label="Item" marker={<span data-testid="marker">•</span>} />);
    expect(screen.getByTestId('marker')).toBeInTheDocument();
  });

  it('renders startContent', () => {
    render(
      <Item label="Item" startContent={<span data-testid="avatar">A</span>} />,
    );
    expect(screen.getByTestId('avatar')).toBeInTheDocument();
  });

  it('renders endContent', () => {
    render(
      <Item label="Item" endContent={<span data-testid="badge">3</span>} />,
    );
    expect(screen.getByTestId('badge')).toBeInTheDocument();
  });

  it('renders all slots together', () => {
    render(
      <Item
        marker={<span data-testid="marker">•</span>}
        startContent={<span data-testid="start">S</span>}
        label="Label"
        description="Description"
        endContent={<span data-testid="end">E</span>}
      />,
    );
    expect(screen.getByTestId('marker')).toBeInTheDocument();
    expect(screen.getByTestId('start')).toBeInTheDocument();
    expect(screen.getByText('Label')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByTestId('end')).toBeInTheDocument();
  });

  it('supports data-testid', () => {
    render(<Item label="Item" data-testid="my-item" />);
    expect(screen.getByTestId('my-item')).toBeInTheDocument();
  });

  it('renders as a div element', () => {
    const {container} = render(<Item label="Item" />);
    expect(container.firstChild?.nodeName).toBe('DIV');
  });

  // ===========================================================================
  // Ref forwarding
  // ===========================================================================

  it('forwards ref to the root element', () => {
    let refValue: HTMLElement | null = null;
    render(
      <Item
        label="Item"
        ref={el => {
          refValue = el;
        }}
      />,
    );
    expect(refValue).toBeInstanceOf(HTMLDivElement);
  });

  // ===========================================================================
  // Interactive — onClick (invisible button pattern)
  // ===========================================================================

  it('renders an invisible button when onClick is provided', () => {
    const onClick = vi.fn();
    const {container} = render(<Item label="Clickable" onClick={onClick} />);
    const button = container.querySelector('button');
    expect(button).toBeInTheDocument();
    expect(button?.textContent).toContain('Clickable');
  });

  it('fires onClick when invisible button is clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Item label="Clickable" onClick={onClick} />);
    await user.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('fires onClick when container area is clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Item
        label="Clickable"
        onClick={onClick}
        data-testid="item"
        startContent={<span data-testid="start">S</span>}
      />,
    );
    await user.click(screen.getByTestId('start'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire item onClick when endContent interactive element is clicked', async () => {
    const user = userEvent.setup();
    const itemClick = vi.fn();
    const buttonClick = vi.fn();
    render(
      <Item
        label="Item"
        onClick={itemClick}
        endContent={
          <button type="button" onClick={buttonClick}>
            Action
          </button>
        }
      />,
    );
    await user.click(screen.getByText('Action'));
    expect(buttonClick).toHaveBeenCalledTimes(1);
    expect(itemClick).not.toHaveBeenCalled();
  });

  it('does not fire item onClick when startContent interactive element is clicked', async () => {
    const user = userEvent.setup();
    const itemClick = vi.fn();
    const buttonClick = vi.fn();
    render(
      <Item
        label="Item"
        onClick={itemClick}
        startContent={
          <button type="button" onClick={buttonClick}>
            Open
          </button>
        }
      />,
    );
    await user.click(screen.getByText('Open'));
    expect(buttonClick).toHaveBeenCalledTimes(1);
    expect(itemClick).not.toHaveBeenCalled();
  });

  it('invisible button is focusable via keyboard', async () => {
    const user = userEvent.setup();
    render(<Item label="Focusable" onClick={() => {}} />);
    await user.tab();
    expect(screen.getByRole('button')).toHaveFocus();
  });

  it('invisible button can be activated via keyboard', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Item label="Pressable" onClick={onClick} />);
    await user.tab();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not render nested buttons — only one invisible button', () => {
    const {container} = render(<Item label="Item" onClick={() => {}} />);
    const buttons = container.querySelectorAll('div button');
    expect(buttons).toHaveLength(1);
  });

  // ===========================================================================
  // Interactive — interactiveRef (delegation to a nested control)
  // ===========================================================================

  it('renders no invisible button in interactiveRef (delegation) mode', () => {
    const {container} = render(<DelegatingItem />);
    // The nested control provides keyboard access — the row must not add a
    // second focusable control for the same action (WCAG 4.1.2).
    expect(container.querySelector('button')).not.toBeInTheDocument();
  });

  it('keeps the nested control as the only tab stop in interactiveRef mode', async () => {
    const user = userEvent.setup();
    render(<DelegatingItem />);
    await user.tab();
    expect(screen.getByRole('checkbox')).toHaveFocus();
    // Next tab leaves the item entirely — the row itself is not focusable.
    await user.tab();
    expect(screen.getByRole('checkbox')).not.toHaveFocus();
    expect(document.body).toHaveFocus();
  });

  it('delegates a row-surface click to the interactive control', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<DelegatingItem onToggle={onToggle} />);
    // Clicking the label (row surface) is forwarded to the checkbox.
    await user.click(screen.getByText('Row'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('does not double-fire when the interactive control itself is clicked', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<DelegatingItem onToggle={onToggle} />);
    await user.click(screen.getByRole('checkbox'));
    // The row must not re-forward the control's own click back to it.
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('ignores onClick when interactiveRef is set (delegation wins, single tab stop)', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    function ItemWithBoth() {
      const ref = useRef<HTMLInputElement>(null);
      return (
        <Item
          label="Row"
          onClick={onClick}
          interactiveRef={ref}
          startContent={
            <input ref={ref} type="checkbox" aria-label="Pick row" />
          }
        />
      );
    }
    const {container} = render(<ItemWithBoth />);
    // No invisible button (onClick is ignored in delegation mode)...
    expect(container.querySelector('button')).not.toBeInTheDocument();
    // ...and the checkbox is still the sole tab stop.
    await user.tab();
    expect(screen.getByRole('checkbox')).toHaveFocus();
  });

  // ===========================================================================
  // Interactive — href (invisible anchor pattern)
  // ===========================================================================

  it('renders an invisible anchor when href is provided', () => {
    const {container} = render(<Item label="Link" href="/docs" />);
    const anchor = container.querySelector('a');
    expect(anchor).toBeInTheDocument();
    expect(anchor).toHaveAttribute('href', '/docs');
    expect(anchor?.textContent).toContain('Link');
  });

  it('sets target on anchor when provided', () => {
    const {container} = render(
      <Item label="External" href="https://example.com" target="_blank" />,
    );
    const anchor = container.querySelector('a');
    expect(anchor).toHaveAttribute('target', '_blank');
    expect(anchor).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('preserves existing rel tokens when target is blank', () => {
    const {container} = render(
      <Item
        label="External"
        href="https://example.com"
        target="_blank"
        rel="sponsored noopener"
      />,
    );
    const anchor = container.querySelector('a');
    expect(anchor).toHaveAttribute('rel', 'sponsored noopener noreferrer');
  });

  it('does not render button or anchor for static items', () => {
    const {container} = render(<Item label="Static" />);
    expect(container.querySelector('button')).not.toBeInTheDocument();
    expect(container.querySelector('a')).not.toBeInTheDocument();
  });

  // ===========================================================================
  // Disabled state
  // ===========================================================================

  it('applies aria-disabled when isDisabled', () => {
    render(<Item label="Disabled" isDisabled data-testid="item" />);
    expect(screen.getByTestId('item')).toHaveAttribute('aria-disabled', 'true');
  });

  it('disables the invisible button when isDisabled', () => {
    const {container} = render(
      <Item label="Disabled" onClick={() => {}} isDisabled />,
    );
    const button = container.querySelector('button');
    expect(button).toBeDisabled();
  });

  it('does not fire onClick when disabled item is clicked', async () => {
    const onClick = vi.fn();
    render(
      <Item label="Disabled" onClick={onClick} isDisabled data-testid="item" />,
    );
    const item = screen.getByTestId('item');
    item.dispatchEvent(new MouseEvent('click', {bubbles: true}));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('does not set aria-disabled when not disabled', () => {
    render(<Item label="Item" data-testid="item" />);
    expect(screen.getByTestId('item')).not.toHaveAttribute('aria-disabled');
  });

  // ===========================================================================
  // Selected state
  // ===========================================================================

  it('conveys selection via aria-current on the default div root', () => {
    // aria-selected is invalid ARIA on a generic div (axe: aria-allowed-attr),
    // so selection is exposed via aria-current, which is valid on any element.
    render(<Item label="Selected" isSelected data-testid="item" />);
    const item = screen.getByTestId('item');
    expect(item).not.toHaveAttribute('aria-selected');
    expect(item).toHaveAttribute('aria-current', 'true');
  });

  it('applies aria-selected (not aria-current) when the role permits it', () => {
    render(
      <Item label="Selected" isSelected role="option" data-testid="item" />,
    );
    const item = screen.getByTestId('item');
    expect(item).toHaveAttribute('aria-selected', 'true');
    // A permitted role uses aria-selected; aria-current would be redundant.
    expect(item).not.toHaveAttribute('aria-current');
  });

  it('falls back to aria-current when the role does not permit aria-selected', () => {
    render(
      <Item label="Selected" isSelected role="menuitem" data-testid="item" />,
    );
    const item = screen.getByTestId('item');
    expect(item).not.toHaveAttribute('aria-selected');
    expect(item).toHaveAttribute('aria-current', 'true');
  });

  it('applies neither aria-selected nor aria-current when not selected', () => {
    render(<Item label="Not Selected" role="option" data-testid="item" />);
    const item = screen.getByTestId('item');
    expect(item).not.toHaveAttribute('aria-selected');
    expect(item).not.toHaveAttribute('aria-current');
  });

  it('lets a consumer-provided aria-current win over the selection default', () => {
    render(
      <Item label="Step" isSelected aria-current="step" data-testid="item" />,
    );
    expect(screen.getByTestId('item')).toHaveAttribute('aria-current', 'step');
  });

  // ===========================================================================
  // Highlighted state
  // ===========================================================================

  it('renders with isHighlighted without errors', () => {
    render(<Item label="Highlighted" isHighlighted data-testid="item" />);
    expect(screen.getByTestId('item')).toBeInTheDocument();
  });

  // ===========================================================================
  // Marker, start, and end slot positions
  // ===========================================================================

  it('marker, startContent, and endContent are siblings to invisible button', () => {
    const {container} = render(
      <Item
        label="Item"
        onClick={() => {}}
        marker={<span data-testid="marker">•</span>}
        startContent={<span data-testid="start">S</span>}
        endContent={<span data-testid="end">E</span>}
      />,
    );
    const button = container.querySelector('button');
    const root = container.firstElementChild;
    expect(root?.querySelector('[data-testid="marker"]')).toBeInTheDocument();
    expect(root?.querySelector('[data-testid="start"]')).toBeInTheDocument();
    expect(root?.querySelector('[data-testid="end"]')).toBeInTheDocument();
    expect(
      button?.querySelector('[data-testid="marker"]'),
    ).not.toBeInTheDocument();
    expect(
      button?.querySelector('[data-testid="start"]'),
    ).not.toBeInTheDocument();
    expect(
      button?.querySelector('[data-testid="end"]'),
    ).not.toBeInTheDocument();
  });

  // ===========================================================================
  // Density variants
  // ===========================================================================

  it('renders with balanced density by default', () => {
    render(<Item label="Item" data-testid="item" />);
    expect(screen.getByTestId('item')).toBeInTheDocument();
    expect(screen.getByTestId('item')).toHaveAttribute(
      'data-density',
      'balanced',
    );
  });

  it('renders with compact density', () => {
    render(<Item label="Item" density="compact" data-testid="item" />);
    expect(screen.getByTestId('item')).toBeInTheDocument();
  });

  it('renders with spacious density', () => {
    render(<Item label="Item" density="spacious" data-testid="item" />);
    expect(screen.getByTestId('item')).toBeInTheDocument();
    expect(screen.getByTestId('item')).toHaveAttribute(
      'data-density',
      'spacious',
    );
  });

  // ===========================================================================
  // Alignment
  // ===========================================================================

  it('renders with center alignment by default', () => {
    render(<Item label="Item" data-testid="item" />);
    expect(screen.getByTestId('item')).toBeInTheDocument();
  });

  it('renders with start alignment', () => {
    render(<Item label="Item" align="start" data-testid="item" />);
    expect(screen.getByTestId('item')).toBeInTheDocument();
  });

  it('reflects the resolved alignment on the item theme target', () => {
    const {rerender} = render(<Item label="Item" data-testid="item" />);
    expect(screen.getByTestId('item')).toHaveAttribute('data-align', 'center');
    for (const align of ['center', 'start', 'first-line'] as const) {
      rerender(<Item label="Item" align={align} data-testid="item" />);
      const item = screen.getByTestId('item');
      expect(item).toHaveClass('astryx-item');
      expect(item).toHaveAttribute('data-align', align);
    }
  });

  it('aligns the row on first baselines only under first-line', () => {
    const {rerender} = render(<Item label="Item" data-testid="item" />);
    const declares = (value: string) =>
      rulesDeclaredFor(screen.getByTestId('item')).some(rule =>
        rule.includes(`align-items: ${value}`),
      );
    expect(declares('baseline')).toBe(false);
    rerender(<Item label="Item" align="start" data-testid="item" />);
    expect(declares('baseline')).toBe(false);
    rerender(<Item label="Item" align="first-line" data-testid="item" />);
    expect(declares('baseline')).toBe(true);
  });

  it('gives each first-line slot a strut with no accessible text', () => {
    render(
      <Item
        label="Item"
        align="first-line"
        startContent={<span data-testid="start">S</span>}
        endContent={<span data-testid="end">E</span>}
      />,
    );
    for (const id of ['start', 'end']) {
      const slot = screen.getByTestId(id).parentElement!;
      const before = rulesDeclaredFor(slot).filter(rule =>
        rule.slice(0, rule.indexOf('{')).includes('::before'),
      );
      expect(before.some(rule => rule.includes('/ ""'))).toBe(true);
    }
  });

  it('leaves center and start slots without a strut', () => {
    const {rerender} = render(
      <Item label="Item" startContent={<span data-testid="start">S</span>} />,
    );
    const hasStrut = () =>
      rulesDeclaredFor(screen.getByTestId('start').parentElement!).some(rule =>
        rule.slice(0, rule.indexOf('{')).includes('::before'),
      );
    expect(hasStrut()).toBe(false);
    rerender(
      <Item
        label="Item"
        align="start"
        startContent={<span data-testid="start">S</span>}
      />,
    );
    expect(hasStrut()).toBe(false);
  });

  // ===========================================================================
  // Description rendering
  // ===========================================================================

  it('does not render description when not provided', () => {
    render(<Item label="Label Only" />);
    expect(screen.getByText('Label Only')).toBeInTheDocument();
    expect(screen.queryByText('undefined')).not.toBeInTheDocument();
  });

  it('accepts ReactNode as description', () => {
    render(
      <Item
        label="Item"
        description={
          <div>
            <span>Rich</span> <span>description</span>
          </div>
        }
      />,
    );
    expect(screen.getByText('Rich')).toBeInTheDocument();
    expect(screen.getByText('description')).toBeInTheDocument();
  });

  it('accepts ReactNode as label', () => {
    render(
      <Item
        label={
          <span>
            <b>Alice</b> commented
          </span>
        }
      />,
    );
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText(/commented/)).toBeInTheDocument();
  });
  it('puts the label and description in one row when layout is inline', () => {
    const stacked = render(
      <Item label="Private" description="Only members can access" />,
    );
    const stackedRow = screen.getByText('Private').parentElement;
    stacked.unmount();

    render(
      <Item
        label="Private"
        description="Only members can access"
        layout="inline"
      />,
    );
    const inlineRow = screen.getByText('Private').parentElement;

    // Same container, different styling: the shared content box switches from
    // a column to a row, so its class list must differ from the stacked one.
    expect(inlineRow?.className).not.toBe(stackedRow?.className);
  });

  it('ellipsizes a ReactNode description when layout is inline', () => {
    // A stacked ReactNode description is left alone (it may wrap); an inline
    // one is one line by definition, so it truncates like a string does.
    const stacked = render(
      <Item
        label="Private"
        description={<span>Only members can access</span>}
      />,
    );
    const stackedDescription = screen.getByText('Only members can access')
      .parentElement?.className;
    stacked.unmount();

    render(
      <Item
        label="Private"
        description={<span>Only members can access</span>}
        layout="inline"
      />,
    );
    expect(
      screen.getByText('Only members can access').parentElement?.className,
    ).not.toBe(stackedDescription);
  });

  it('ignores inline layout when there is no description', () => {
    render(<Item label="Private" layout="inline" />);
    expect(screen.getByText('Private')).toBeInTheDocument();
  });
});

describe('swipeActions', () => {
  // The panels and the gesture are loaded lazily (React.lazy + Suspense), so
  // the first row with swipe actions renders them a tick after it mounts.
  // Mount one once up front: the resolved module is cached on the lazy
  // component, and every row below renders its panels synchronously.
  beforeAll(async () => {
    render(
      <Item
        label="Warm"
        data-testid="warm"
        swipeActions={{leading: [{label: 'Unread', onActivate: () => {}}]}}
      />,
    );
    await waitFor(() => {
      expect(
        screen.getByTestId('warm').querySelector('[data-swipe-panel]'),
      ).not.toBeNull();
    });
    cleanup();
  });

  beforeEach(() => {
    // The gesture reads the clock for its fling test and its settle timers:
    // fake both, and space the moves out the way a finger does.
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'Date',
        'performance',
      ],
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** The first finger down: the primary touch pointer. */
  function touch(
    element: Element,
    type: 'pointerDown' | 'pointerMove' | 'pointerUp' | 'pointerCancel',
    x: number,
    y = 10,
  ) {
    vi.advanceTimersByTime(50);
    fireEvent[type](element, {
      clientX: x,
      clientY: y,
      isPrimary: true,
      pointerId: 7,
      pointerType: 'touch',
    });
  }

  /** A second finger: a touch pointer that is not the primary one. */
  function secondFinger(
    element: Element,
    type: 'pointerDown' | 'pointerMove' | 'pointerUp' | 'pointerCancel',
    x: number,
    y = 10,
  ) {
    vi.advanceTimersByTime(10);
    fireEvent[type](element, {
      clientX: x,
      clientY: y,
      isPrimary: false,
      pointerId: 8,
      pointerType: 'touch',
    });
  }

  /** The time a settle takes, plus the frame before it. */
  const settled = () => void act(() => vi.advanceTimersByTime(250));

  const travelOf = (row: HTMLElement) =>
    row.style.getPropertyValue('--_item-swipe-travel');

  /** The panel of a side: the out-of-flow child on the root carrying it. */
  const panelOf = (row: HTMLElement, side: 'leading' | 'trailing') =>
    row.querySelector(`[data-swipe-panel="${side}"]`);

  /**
   * jsdom lays nothing out: give the row a width and each side's entries a
   * natural width of 72 px per entry, as the real panel measures them.
   */
  function layOut(row: HTMLElement) {
    Object.defineProperty(row, 'clientWidth', {configurable: true, value: 300});
    for (const panel of row.querySelectorAll('[data-swipe-panel]')) {
      const entries = panel.firstElementChild as HTMLElement;
      Object.defineProperty(entries, 'offsetWidth', {
        configurable: true,
        value: 72 * entries.childElementCount,
      });
    }
  }

  type Entry = {
    label: string;
    onActivate: () => void;
    hasRemoval?: boolean;
    isDisabled?: boolean;
    variant?: 'neutral' | 'accent' | 'destructive';
  };

  function renderRow({
    leading = [{label: 'Unread', onActivate: vi.fn()}],
    trailing,
    behavior,
    onClick = vi.fn(),
  }: {
    leading?: Entry[];
    trailing?: Entry[];
    behavior?: 'reveal' | 'commit';
    onClick?: () => void;
  } = {}) {
    render(
      <Item
        label="Conversation"
        onClick={onClick}
        data-testid="row"
        swipeActions={{leading, trailing}}
        swipeBehavior={behavior}
      />,
    );
    const row = screen.getByTestId('row');
    layOut(row);
    return {row, onClick};
  }

  it('is served on a role-less row and a listitem, and not on a row whose role forbids interactive descendants', () => {
    const actions = {leading: [{label: 'Unread', onActivate: vi.fn()}]};
    const {rerender} = render(
      <Item label="A" data-testid="row" swipeActions={actions} />,
    );
    expect(panelOf(screen.getByTestId('row'), 'leading')).not.toBeNull();
    rerender(
      <Item as="li" label="A" data-testid="row" swipeActions={actions} />,
    );
    expect(panelOf(screen.getByTestId('row'), 'leading')).not.toBeNull();
    for (const role of [
      'option',
      'menuitem',
      'menuitemcheckbox',
      'menuitemradio',
    ]) {
      rerender(
        <Item role={role} label="A" data-testid="row" swipeActions={actions} />,
      );
      expect(panelOf(screen.getByTestId('row'), 'leading')).toBeNull();
    }
  });

  it('is not served on a row that is the enlarged target of a nested control, nor on a disabled row', () => {
    const actions = {leading: [{label: 'Unread', onActivate: vi.fn()}]};
    function Delegating() {
      const inputRef = useRef<HTMLInputElement>(null);
      return (
        <Item
          label="A"
          data-testid="row"
          interactiveRef={inputRef}
          startContent={<input ref={inputRef} type="radio" />}
          swipeActions={actions}
        />
      );
    }
    const {unmount} = render(<Delegating />);
    expect(panelOf(screen.getByTestId('row'), 'leading')).toBeNull();
    unmount();
    render(
      <Item label="A" data-testid="row" isDisabled swipeActions={actions} />,
    );
    expect(panelOf(screen.getByTestId('row'), 'leading')).toBeNull();
  });

  it('adds no element to a row without swipe actions, and no wrapper to one with them', () => {
    const {rerender} = render(
      <ul data-testid="list">
        <Item as="li" label="A" data-testid="row" />
      </ul>,
    );
    const before = screen.getByTestId('row').childElementCount;
    rerender(
      <ul data-testid="list">
        <Item
          as="li"
          label="A"
          data-testid="row"
          swipeActions={{trailing: [{label: 'Archive', onActivate: vi.fn()}]}}
        />
      </ul>,
    );
    const row = screen.getByTestId('row');
    // The root is the row; the list is its parent, so the `li` stays the
    // list's direct child. The panel is the one child the actions add.
    expect(row.tagName).toBe('LI');
    expect(row.parentElement).toBe(screen.getByTestId('list'));
    expect(row.childElementCount).toBe(before + 1);
    expect(panelOf(row, 'trailing')).toBe(row.lastElementChild);
    expect(panelOf(row, 'leading')).toBeNull();
  });

  it('keeps the panel out of the accessibility tree and the tab order at rest, with no pixel of it painted', () => {
    const {row} = renderRow();
    const panel = panelOf(row, 'leading') as HTMLElement;
    // Inert: not in the tree, not in the tab order, so the row keeps one tab
    // stop and a pointer that can hover never meets it.
    expect(panel).toHaveAttribute('inert');
    expect(
      screen.getByRole('button', {name: 'Unread'}).closest('[inert]'),
    ).toBe(panel);
    // Zero width with no padding of its own: a padded box at `width: 0` is
    // still as wide as its padding and would paint a sliver of the colour.
    expect(rulesDeclaredFor(panel).some(r => r.includes('padding'))).toBe(
      false,
    );
    // Its width is the travel toward its side, floored at zero; at rest the
    // travel is unset.
    expect(
      rulesDeclaredFor(panel).some(r => r.includes('width: max(0px')),
    ).toBe(true);
    expect(travelOf(row)).toBe('');
  });

  it('claims a sideways drag, writes the travel on the root, and tells the browser the row owns the drag', () => {
    const {row} = renderRow();
    const touchMove = (x: number, y = 10) =>
      fireEvent.touchMove(row, {
        cancelable: true,
        touches: [{clientX: x, clientY: y}],
      });
    touch(row, 'pointerDown', 10);
    // Before the axis is decided the scroller may still take the gesture:
    // the default stands (fireEvent answers false once it is prevented).
    expect(touchMove(14)).toBe(true);
    touch(row, 'pointerMove', 14);
    expect(touchMove(14)).toBe(true);
    expect(travelOf(row)).toBe('');
    // Past the lock and more horizontal than vertical: the row's. Every
    // further touchmove is cancelled, which is what keeps iOS Safari's pan
    // from taking a drag that is not perfectly level.
    touch(row, 'pointerMove', 22, 18);
    expect(touchMove(22, 18)).toBe(false);
    void act(() => vi.advanceTimersByTime(20));
    expect(travelOf(row)).toBe('12px');
    expect(row.style.getPropertyValue('--_item-swipe-dir')).toBe('1');
    expect(row.style.getPropertyValue('--_item-swipe-duration')).toBe('0s');
    touch(row, 'pointerMove', 50, 20);
    void act(() => vi.advanceTimersByTime(20));
    expect(travelOf(row)).toBe('40px');
    touch(row, 'pointerUp', 50, 20);
    settled();
  });

  it('leaves a mostly vertical drag to the scroller and never cancels its touchmove', () => {
    const {row} = renderRow();
    touch(row, 'pointerDown', 10, 10);
    touch(row, 'pointerMove', 14, 40);
    expect(
      fireEvent.touchMove(row, {
        cancelable: true,
        touches: [{clientX: 14, clientY: 40}],
      }),
    ).toBe(true);
    touch(row, 'pointerMove', 120, 200);
    expect(travelOf(row)).toBe('');
    touch(row, 'pointerUp', 120, 200);
  });

  it('ignores a mouse', () => {
    const {row} = renderRow();
    fireEvent.pointerDown(row, {
      clientX: 10,
      clientY: 10,
      pointerId: 1,
      pointerType: 'mouse',
    });
    fireEvent.pointerMove(row, {
      clientX: 60,
      clientY: 10,
      pointerId: 1,
      pointerType: 'mouse',
    });
    void act(() => vi.advanceTimersByTime(20));
    expect(travelOf(row)).toBe('');
    fireEvent.pointerUp(row, {
      clientX: 60,
      clientY: 10,
      pointerId: 1,
      pointerType: 'mouse',
    });
  });

  describe('a pinch', () => {
    /** A touchmove listing both fingers; true when the row cancelled it. */
    const pinchMoveCancelled = (row: Element, x: number) =>
      !fireEvent.touchMove(row, {
        cancelable: true,
        touches: [
          {clientX: x, clientY: 10},
          {clientX: 300 - x, clientY: 10},
        ],
      });

    it('lets the touch go when a second finger lands on the row before the axis is decided, and cancels nothing', () => {
      const {row} = renderRow();
      touch(row, 'pointerDown', 100);
      secondFinger(row, 'pointerDown', 60);
      // The fingers spread apart; the first one travels toward the leading
      // side far past the axis lock.
      touch(row, 'pointerMove', 130);
      secondFinger(row, 'pointerMove', 30);
      touch(row, 'pointerMove', 160);
      expect(pinchMoveCancelled(row, 160)).toBe(false);
      void act(() => vi.advanceTimersByTime(20));
      expect(travelOf(row)).toBe('');
      // The browser takes the pinch.
      touch(row, 'pointerCancel', 160);
      secondFinger(row, 'pointerCancel', 0);
      settled();
      expect(travelOf(row)).toBe('');
    });

    it('lets the touch go when the second finger lands off the row', () => {
      const {row} = renderRow();
      touch(row, 'pointerDown', 100);
      secondFinger(document.body, 'pointerDown', 60, 200);
      touch(row, 'pointerMove', 130);
      touch(row, 'pointerMove', 160);
      expect(pinchMoveCancelled(row, 160)).toBe(false);
      void act(() => vi.advanceTimersByTime(20));
      expect(travelOf(row)).toBe('');
      touch(row, 'pointerCancel', 160);
    });

    it('never starts a drag from a finger that is not the first one down', () => {
      const {row} = renderRow();
      // The first finger is somewhere else on the page; this one lands on
      // the row and travels sideways.
      secondFinger(row, 'pointerDown', 100);
      secondFinger(row, 'pointerMove', 130);
      secondFinger(row, 'pointerMove', 160);
      expect(pinchMoveCancelled(row, 160)).toBe(false);
      void act(() => vi.advanceTimersByTime(20));
      expect(travelOf(row)).toBe('');
      secondFinger(row, 'pointerUp', 160);
    });

    it('keeps a drag the row already owns when a second finger lands', () => {
      const {row} = renderRow();
      touch(row, 'pointerDown', 10);
      touch(row, 'pointerMove', 30);
      touch(row, 'pointerMove', 45);
      void act(() => vi.advanceTimersByTime(20));
      expect(travelOf(row)).toBe('35px');
      secondFinger(row, 'pointerDown', 200);
      touch(row, 'pointerMove', 60);
      expect(pinchMoveCancelled(row, 60)).toBe(true);
      void act(() => vi.advanceTimersByTime(20));
      expect(travelOf(row)).toBe('50px');
      touch(row, 'pointerUp', 60);
      secondFinger(row, 'pointerUp', 200);
      settled();
      expect(travelOf(row)).toBe('72px');
    });

    it('stops listening to the document once the axis is decided or the touch ends', () => {
      const add = vi.spyOn(document, 'addEventListener');
      const remove = vi.spyOn(document, 'removeEventListener');
      try {
        const {row} = renderRow();
        const watching = () =>
          add.mock.calls.filter(([type]) => type === 'pointerdown').length -
          remove.mock.calls.filter(([type]) => type === 'pointerdown').length;
        const before = watching();
        touch(row, 'pointerDown', 10);
        expect(watching()).toBe(before + 1);
        touch(row, 'pointerMove', 40);
        expect(watching()).toBe(before);
        touch(row, 'pointerUp', 40);
        settled();
        touch(row, 'pointerDown', 10);
        expect(watching()).toBe(before + 1);
        touch(row, 'pointerUp', 12);
        expect(watching()).toBe(before);
      } finally {
        add.mockRestore();
        remove.mockRestore();
      }
    });
  });

  it('does not move toward a side without entries', () => {
    const {row} = renderRow({
      leading: [{label: 'Unread', onActivate: vi.fn()}],
    });
    touch(row, 'pointerDown', 200);
    touch(row, 'pointerMove', 150);
    void act(() => vi.advanceTimersByTime(20));
    expect(travelOf(row)).toBe('');
    touch(row, 'pointerUp', 150);
  });

  describe('reveal (the default)', () => {
    it('springs back when released short of half the panel, on the settle clock', () => {
      const {row} = renderRow();
      touch(row, 'pointerDown', 10);
      touch(row, 'pointerMove', 30);
      touch(row, 'pointerMove', 40);
      touch(row, 'pointerUp', 40);
      // 30 px of a 72 px panel: short. The spring back runs on the clock the
      // transforms read, then every inline property is gone.
      expect(row.style.getPropertyValue('--_item-swipe-duration')).toBe(
        '200ms',
      );
      expect(travelOf(row)).toBe('0px');
      settled();
      expect(travelOf(row)).toBe('');
      expect(row.style.getPropertyValue('--_item-swipe-dir')).toBe('');
      expect(panelOf(row, 'leading')).toHaveAttribute('inert');
    });

    it('rests open past half the panel, with every entry a real button, and fires a tapped entry', () => {
      const onActivate = vi.fn();
      const onClick = vi.fn();
      const {row} = renderRow({
        leading: [{label: 'Unread', onActivate}],
        onClick,
      });
      touch(row, 'pointerDown', 10);
      touch(row, 'pointerMove', 30);
      touch(row, 'pointerMove', 45);
      touch(row, 'pointerMove', 60);
      touch(row, 'pointerUp', 60);
      settled();
      // Resting at the panel's width; the panel is live.
      expect(travelOf(row)).toBe('72px');
      const panel = panelOf(row, 'leading') as HTMLElement;
      expect(panel).not.toHaveAttribute('inert');
      const button = screen.getByRole('button', {name: 'Unread'});
      expect(button).toBeVisible();
      // A tap fires it at once; without `hasRemoval` the row closes.
      fireEvent.click(button);
      expect(onActivate).toHaveBeenCalledTimes(1);
      settled();
      expect(travelOf(row)).toBe('');
      expect(panel).toHaveAttribute('inert');
      // The row's own primary never fired.
      expect(onClick).not.toHaveBeenCalled();
    });

    it('holds the row out after a tapped entry with hasRemoval', () => {
      const onActivate = vi.fn();
      const {row} = renderRow({
        trailing: [{label: 'Archive', onActivate, hasRemoval: true}],
        leading: [],
      });
      touch(row, 'pointerDown', 200);
      touch(row, 'pointerMove', 180);
      touch(row, 'pointerMove', 160);
      touch(row, 'pointerMove', 140);
      touch(row, 'pointerUp', 140);
      settled();
      expect(travelOf(row)).toBe('-72px');
      fireEvent.click(screen.getByRole('button', {name: 'Archive'}));
      expect(onActivate).toHaveBeenCalledTimes(1);
      settled();
      // Out past the edge it travelled toward, and staying there: the
      // caller removes the row, or it sits off-screen (their bug).
      expect(travelOf(row)).toBe('-324px');
      settled();
      expect(travelOf(row)).toBe('-324px');
    });

    it('closes a resting row on a pointer outside it, and on Escape with focus inside', () => {
      const {row} = renderRow();
      const open = () => {
        touch(row, 'pointerDown', 10);
        touch(row, 'pointerMove', 30);
        touch(row, 'pointerMove', 45);
        touch(row, 'pointerMove', 60);
        touch(row, 'pointerUp', 60);
        settled();
        expect(travelOf(row)).toBe('72px');
      };
      open();
      // A drag on a neighbour is a pointer outside this row.
      fireEvent.pointerDown(document.body, {
        pointerId: 9,
        pointerType: 'touch',
      });
      settled();
      expect(travelOf(row)).toBe('');
      open();
      const button = screen.getByRole('button', {name: 'Unread'});
      button.focus();
      fireEvent.keyDown(button, {key: 'Escape'});
      settled();
      expect(travelOf(row)).toBe('');
      // Focus lands on the row's own content, not on a now-inert button.
      expect(document.activeElement).toBe(
        screen.getByRole('button', {name: 'Conversation'}),
      );
    });

    it('fires the outermost entry and no other on a drag past the commit point, then springs back', () => {
      const inner = vi.fn();
      const outer = vi.fn();
      const {row} = renderRow({
        leading: [
          {label: 'Unread', onActivate: inner},
          {label: 'Pin', onActivate: outer},
        ],
      });
      touch(row, 'pointerDown', 10);
      touch(row, 'pointerMove', 40);
      // Two entries: a 144 px panel; the commit point is 192 (panel + 48),
      // past half the 300 px row.
      touch(row, 'pointerMove', 210);
      touch(row, 'pointerUp', 210);
      expect(outer).not.toHaveBeenCalled();
      // One beat: the slide out, then the entry fires.
      expect(travelOf(row)).toBe('324px');
      settled();
      expect(outer).toHaveBeenCalledTimes(1);
      expect(inner).not.toHaveBeenCalled();
      // No `hasRemoval`: back home.
      settled();
      expect(travelOf(row)).toBe('');
    });

    it('commits on a fling short of the commit point', () => {
      const onActivate = vi.fn();
      const {row} = renderRow({leading: [{label: 'Unread', onActivate}]});
      touch(row, 'pointerDown', 10);
      touch(row, 'pointerMove', 30);
      // 50 px in the 50 ms step: well past the fling speed.
      touch(row, 'pointerMove', 80);
      touch(row, 'pointerUp', 80);
      settled();
      expect(onActivate).toHaveBeenCalledTimes(1);
    });

    it('lays the entries outermost last: at the leading edge the row of entries runs in reverse', () => {
      const {row} = renderRow({
        leading: [
          {label: 'Unread', onActivate: vi.fn()},
          {label: 'Pin', onActivate: vi.fn()},
        ],
        trailing: [
          {label: 'Archive', onActivate: vi.fn()},
          {label: 'Delete', onActivate: vi.fn(), variant: 'destructive'},
        ],
      });
      const leading = panelOf(row, 'leading')?.firstElementChild as HTMLElement;
      const trailing = panelOf(row, 'trailing')
        ?.firstElementChild as HTMLElement;
      expect(
        rulesDeclaredFor(leading).some(r =>
          r.includes('flex-direction: row-reverse'),
        ),
      ).toBe(true);
      expect(
        rulesDeclaredFor(trailing).some(r =>
          r.includes('flex-direction: row-reverse'),
        ),
      ).toBe(false);
      // The panel wears its outermost entry's colour, so a slide-out fills
      // the row with it.
      const outerVariant = (panelOf(row, 'trailing') as HTMLElement).className;
      const deleteVariant = (trailing.lastElementChild as HTMLElement)
        .className;
      expect(outerVariant.split(' ').some(c => deleteVariant.includes(c))).toBe(
        true,
      );
    });
  });

  describe('commit', () => {
    it('slides out and fires on a release past the commit point; nothing rests', () => {
      const onActivate = vi.fn();
      const {row} = renderRow({
        behavior: 'commit',
        leading: [{label: 'Unread', onActivate}],
      });
      const panel = panelOf(row, 'leading') as HTMLElement;
      // Presentational at all times: nothing in it is ever tappable.
      expect(panel).toHaveAttribute('aria-hidden', 'true');
      expect(panel.querySelector('button')).toBeNull();
      touch(row, 'pointerDown', 10);
      touch(row, 'pointerMove', 40);
      // One entry: 72 px panel; the commit point is half the 300 px row.
      touch(row, 'pointerMove', 160);
      touch(row, 'pointerUp', 160);
      expect(travelOf(row)).toBe('324px');
      settled();
      expect(onActivate).toHaveBeenCalledTimes(1);
      settled();
      expect(travelOf(row)).toBe('');
      expect(panel).toHaveAttribute('aria-hidden', 'true');
    });

    it('springs back from any release short of the commit point, even past the panel', () => {
      const onActivate = vi.fn();
      const {row} = renderRow({
        behavior: 'commit',
        leading: [{label: 'Unread', onActivate}],
      });
      touch(row, 'pointerDown', 10);
      touch(row, 'pointerMove', 40);
      touch(row, 'pointerMove', 65);
      touch(row, 'pointerMove', 90);
      touch(row, 'pointerMove', 100);
      touch(row, 'pointerUp', 100);
      settled();
      expect(onActivate).not.toHaveBeenCalled();
      expect(travelOf(row)).toBe('');
    });

    it('holds out after a committed entry with hasRemoval', () => {
      const onActivate = vi.fn();
      const {row} = renderRow({
        behavior: 'commit',
        leading: [{label: 'Archive', onActivate, hasRemoval: true}],
      });
      touch(row, 'pointerDown', 10);
      touch(row, 'pointerMove', 40);
      touch(row, 'pointerMove', 160);
      touch(row, 'pointerUp', 160);
      settled();
      expect(onActivate).toHaveBeenCalledTimes(1);
      settled();
      expect(travelOf(row)).toBe('324px');
    });

    it('warns in development when a committing side has more than one entry', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        renderRow({
          behavior: 'commit',
          leading: [
            {label: 'Unread', onActivate: vi.fn()},
            {label: 'Pin', onActivate: vi.fn()},
          ],
        });
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining('swipeBehavior="commit"'),
        );
      } finally {
        warn.mockRestore();
      }
    });
  });

  it('swallows the click the browser synthesizes after a drag, so the primary does not fire', () => {
    const onClick = vi.fn();
    const {row} = renderRow({onClick});
    touch(row, 'pointerDown', 10);
    touch(row, 'pointerMove', 30);
    touch(row, 'pointerMove', 40);
    touch(row, 'pointerUp', 40);
    fireEvent.click(screen.getByRole('button', {name: 'Conversation'}));
    expect(onClick).not.toHaveBeenCalled();
    settled();
    // A later tap is a tap.
    vi.advanceTimersByTime(500);
    fireEvent.click(screen.getByRole('button', {name: 'Conversation'}));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('reads the direction logically under RTL: leading is toward the inline end, and the sign rides the root', () => {
    // jsdom resolves `direction` only on the element that carries `dir`; a
    // browser inherits it down to the row, so resolve that inheritance by
    // hand for this test.
    const original = window.getComputedStyle.bind(window);
    const spy = vi
      .spyOn(window, 'getComputedStyle')
      .mockImplementation((element, pseudo) => {
        const style = original(element, pseudo ?? undefined);
        if (element.closest('[dir="rtl"]') != null) {
          Object.defineProperty(style, 'direction', {
            configurable: true,
            value: 'rtl',
          });
        }
        return style;
      });
    try {
      const onActivate = vi.fn();
      render(
        <div dir="rtl">
          <Item
            label="Conversation"
            onClick={vi.fn()}
            data-testid="row"
            swipeActions={{leading: [{label: 'Unread', onActivate}]}}
          />
        </div>,
      );
      const row = screen.getByTestId('row');
      layOut(row);
      // Toward the inline end is leftward: the finger moves to smaller x.
      touch(row, 'pointerDown', 200);
      touch(row, 'pointerMove', 180);
      touch(row, 'pointerMove', 160);
      touch(row, 'pointerMove', 140);
      void act(() => vi.advanceTimersByTime(20));
      expect(row.style.getPropertyValue('--_item-swipe-dir')).toBe('-1');
      // Physical travel is negative; the transforms multiply by the sign.
      expect(travelOf(row)).toBe('-60px');
      touch(row, 'pointerUp', 140);
      settled();
      expect(travelOf(row)).toBe('-72px');
      // Rightward from a closed row is toward the inline start: no trailing
      // entries, so it is not claimed.
      fireEvent.pointerDown(document.body, {
        pointerId: 9,
        pointerType: 'touch',
      });
      settled();
      touch(row, 'pointerDown', 10);
      touch(row, 'pointerMove', 60);
      void act(() => vi.advanceTimersByTime(20));
      expect(travelOf(row)).toBe('');
      touch(row, 'pointerUp', 60);
    } finally {
      spy.mockRestore();
    }
  });
});
