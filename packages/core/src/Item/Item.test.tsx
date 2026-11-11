// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Item.test.tsx
 * @input Uses vitest, @testing-library/react, Item component
 * @output Unit tests for Item, including flat marker DOM and numbered-row scope
 * @position Testing; validates Item component implementation
 *
 * SYNC: When Item component changes, update tests to match new behavior
 */

import {Activity, use, useRef, useState, type ReactNode} from 'react';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from 'vitest';
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import {layerOnlyWhilePressed, rulesDeclaredFor} from '../__tests__/pressState';
import {swipeLayerLoaded} from './__tests__/swipeLayerLoaded';
import userEvent from '@testing-library/user-event';
import {LinkProvider} from '../Link/LinkProvider';
import {Item} from './Item';
import {useClickableContainer} from '../hooks/useClickableContainer';
import {createSwipe} from '../Swipe/createSwipe';
import type {Swipe} from '../Swipe/swipeHost';
import {ItemDescriptionContext} from './ItemDescriptionContext';
import {List, ListItem} from '../List';
import {emulateTouch} from './__tests__/emulateTouch';
import {TapGestureRecognizer, useGestureRecognizer} from '../gestures';

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

  it('drops its pressable marker when a row stops delegating, so a mouse click in its padding reaches a clickable container around it', () => {
    const cardClick = vi.fn();
    function Card({delegates}: {delegates: boolean}) {
      const cardRef = useRef<HTMLDivElement | null>(null);
      const checkboxRef = useRef<HTMLInputElement>(null);
      const {onClick} = useClickableContainer({
        containerRef: cardRef,
        onClick: cardClick,
      });
      return (
        <div ref={cardRef} onClick={onClick}>
          <Item
            label="Row"
            interactiveRef={delegates ? checkboxRef : undefined}
            startContent={
              <input ref={checkboxRef} type="checkbox" aria-label="Pick row" />
            }
          />
        </div>
      );
    }
    const {container, rerender} = render(<Card delegates />);
    const row = container.firstElementChild?.firstElementChild as HTMLElement;
    expect(row).toHaveAttribute('data-pressable-container', 'true');

    rerender(<Card delegates={false} />);
    expect(row).not.toHaveAttribute('data-pressable-container');
    withPrimaryPointer(false, () => {
      fireEvent.click(row, {detail: 1});
    });
    expect(cardClick).toHaveBeenCalledTimes(1);
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

  /** A List link row whose box spans x 0–100 and y 10–50, its anchor followed. */
  function linkRow(endContent?: ReactNode) {
    const {container} = render(
      <List>
        <ListItem label="Link" href="/docs" endContent={endContent} />
      </List>,
    );
    const anchor = container.querySelector('a') as HTMLAnchorElement;
    const followed = vi.fn((event: MouseEvent) => event.preventDefault());
    anchor.addEventListener('click', followed);
    const row = container.querySelector('li') as HTMLElement;
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({x: 0, y: 10, width: 100, height: 40}),
    );
    return {anchor, followed, row};
  }

  it('follows the link on a tap in a List link row’s touch band, past its box', () => {
    const {anchor, followed, row} = linkRow();
    fireEvent.click(row, {clientX: 50, clientY: 5, detail: 1});
    expect(followed).toHaveBeenCalledTimes(1);
    // A click on the anchor itself follows it once, not twice.
    fireEvent.click(anchor);
    expect(followed).toHaveBeenCalledTimes(2);
    // Modifier keys carry over, so a ctrl or cmd tap opens as on the label.
    fireEvent.click(row, {clientX: 50, clientY: 55, detail: 1, ctrlKey: true});
    expect(followed).toHaveBeenCalledTimes(3);
    expect(followed.mock.calls[2][0].ctrlKey).toBe(true);
  });

  it('does nothing for a mouse click inside a List link row’s box but outside its anchor', () => {
    const {followed, row} = linkRow();
    fireEvent.click(row, {clientX: 4, clientY: 30, detail: 1});
    expect(followed).not.toHaveBeenCalled();
  });

  /** Runs `body` with the primary pointer coarse or fine. */
  function withPrimaryPointer(coarse: boolean, body: () => void) {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: coarse && query === '(pointer: coarse)',
      media: query,
      addEventListener() {},
      removeEventListener() {},
    })) as unknown as typeof window.matchMedia;
    try {
      body();
    } finally {
      window.matchMedia = original;
    }
  }

  it('decides a tap in a List link row’s own padding by the primary pointer, not the pointer that made it', () => {
    const {followed, row} = linkRow();
    // A fine primary pointer keeps the anchor as the target: a finger's tap in
    // the padding (a touch screen beside a mouse) does nothing.
    withPrimaryPointer(false, () => {
      fireEvent.pointerDown(row, {pointerType: 'touch'});
      fireEvent.click(row, {clientX: 4, clientY: 30, detail: 1});
    });
    expect(followed).not.toHaveBeenCalled();
    // Under a coarse primary pointer the padding is part of the row's
    // target, whatever pointer made the click (WebKit reports a finger's
    // click as `mouse`).
    withPrimaryPointer(true, () => {
      fireEvent.pointerDown(row, {pointerType: 'mouse'});
      fireEvent.click(row, {clientX: 4, clientY: 30, detail: 1});
    });
    expect(followed).toHaveBeenCalledTimes(1);
  });

  it('keeps a standalone link Item to its anchor under a finger: a tap in its padding or past its box does nothing', () => {
    const {container} = render(<Item label="Link" href="/docs" />);
    const anchor = container.querySelector('a') as HTMLAnchorElement;
    const followed = vi.fn((event: MouseEvent) => event.preventDefault());
    anchor.addEventListener('click', followed);
    const row = container.firstElementChild as HTMLElement;
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({x: 0, y: 10, width: 100, height: 40}),
    );
    withPrimaryPointer(true, () => {
      fireEvent.click(row, {clientX: 4, clientY: 30, detail: 1});
      fireEvent.click(row, {clientX: 50, clientY: 5, detail: 1});
    });
    expect(followed).not.toHaveBeenCalled();
    // Present first: its anchor itself still follows.
    fireEvent.click(anchor);
    expect(followed).toHaveBeenCalledTimes(1);
  });

  it('keeps a link Item inside a List row’s content to its anchor under a finger', () => {
    const {container} = render(
      <List>
        <ListItem label="Row" endContent={<Item label="Nested" href="/n" />} />
      </List>,
    );
    const nested = container.querySelector('li [href="/n"]')?.parentElement;
    const anchor = container.querySelector('[href="/n"]') as HTMLElement;
    const followed = vi.fn((event: MouseEvent) => event.preventDefault());
    anchor.addEventListener('click', followed);
    // Present first: the nested Item is in the row.
    expect(nested).not.toBeNull();
    withPrimaryPointer(true, () => {
      fireEvent.click(nested as HTMLElement, {detail: 1});
    });
    expect(followed).not.toHaveBeenCalled();
  });

  it('under a finger, leaves a tap on a control in a List link row’s end content to that control', () => {
    const control = vi.fn();
    const {followed} = linkRow(
      <span role="button" tabIndex={0} onClick={control}>
        More
      </span>,
    );
    withPrimaryPointer(true, () => {
      fireEvent.click(screen.getByRole('button', {name: 'More'}), {detail: 1});
    });
    expect(control).toHaveBeenCalledTimes(1);
    expect(followed).not.toHaveBeenCalled();
  });

  it('under a finger, does not follow a List link row’s link on the click that ends a text selection in it', () => {
    const {followed, row} = linkRow();
    // Present first: the same tap with no selection follows the link.
    withPrimaryPointer(true, () => {
      fireEvent.click(row, {clientX: 4, clientY: 30, detail: 1});
    });
    expect(followed).toHaveBeenCalledTimes(1);
    const selection = document.getSelection() as Selection;
    selection.selectAllChildren(row);
    try {
      withPrimaryPointer(true, () => {
        fireEvent.click(row, {clientX: 4, clientY: 30, detail: 1});
      });
      expect(followed).toHaveBeenCalledTimes(1);
    } finally {
      selection.removeAllRanges();
    }
  });

  it('with a mouse, leaves a click in a List link row’s padding to a clickable container around it', () => {
    const cardClick = vi.fn();
    function Card({children}: {children: ReactNode}) {
      const cardRef = useRef<HTMLDivElement | null>(null);
      const {onClick} = useClickableContainer({
        containerRef: cardRef,
        onClick: cardClick,
      });
      return (
        <div ref={cardRef} onClick={onClick}>
          {children}
        </div>
      );
    }
    const {container} = render(
      <Card>
        <List>
          <ListItem label="Link" href="/docs" />
        </List>
      </Card>,
    );
    const row = container.querySelector('li') as HTMLElement;
    const anchor = row.querySelector('a') as HTMLAnchorElement;
    const followed = vi.fn((event: MouseEvent) => event.preventDefault());
    anchor.addEventListener('click', followed);
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({x: 0, y: 10, width: 100, height: 40}),
    );
    withPrimaryPointer(false, () => {
      fireEvent.click(row, {clientX: 4, clientY: 30, detail: 1});
    });
    expect(followed).not.toHaveBeenCalled();
    expect(cardClick).toHaveBeenCalledTimes(1);
    expect(row).not.toHaveAttribute('data-pressable-container');
  });

  it('keeps a List link row unmarked after its Activity hides and shows, so a mouse click in its padding still reaches the card around it', () => {
    const cardClick = vi.fn();
    function Card({hidden}: {hidden: boolean}) {
      const cardRef = useRef<HTMLDivElement | null>(null);
      const {onClick} = useClickableContainer({
        containerRef: cardRef,
        onClick: cardClick,
      });
      return (
        <div ref={cardRef} onClick={onClick}>
          <Activity mode={hidden ? 'hidden' : 'visible'}>
            <List>
              <ListItem label="Link" href="/docs" />
            </List>
          </Activity>
        </div>
      );
    }
    const {container, rerender} = render(<Card hidden={false} />);
    const row = container.querySelector('li') as HTMLElement;
    const anchor = row.querySelector('a') as HTMLAnchorElement;
    const followed = vi.fn((event: MouseEvent) => event.preventDefault());
    anchor.addEventListener('click', followed);
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({x: 0, y: 10, width: 100, height: 40}),
    );
    // A finger's tap in the padding follows the link.
    withPrimaryPointer(true, () => {
      fireEvent.click(row, {clientX: 4, clientY: 30, detail: 1});
    });
    expect(followed).toHaveBeenCalledTimes(1);
    rerender(<Card hidden />);
    rerender(<Card hidden={false} />);
    expect(row).not.toHaveAttribute('data-pressable-container');
    withPrimaryPointer(false, () => {
      fireEvent.click(row, {clientX: 4, clientY: 30, detail: 1});
    });
    expect(cardClick).toHaveBeenCalledTimes(1);
    expect(followed).toHaveBeenCalledTimes(1);
  });

  it('does nothing for a click with no pointer behind it', () => {
    const {followed, row} = linkRow();
    fireEvent.click(row, {clientX: 50, clientY: 5, detail: 0});
    expect(followed).not.toHaveBeenCalled();
  });

  it('keeps a row with both onClick and href on onClick for a click in its own box', () => {
    const onClick = vi.fn();
    const {container} = render(
      <Item label="Both" href="/docs" onClick={onClick} />,
    );
    const anchor = container.querySelector('a') as HTMLAnchorElement;
    const followed = vi.fn((event: MouseEvent) => event.preventDefault());
    anchor.addEventListener('click', followed);
    fireEvent.click(container.firstElementChild as HTMLElement);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(followed).not.toHaveBeenCalled();
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

  it("gives a disabled row's link no destination (spec:AST-085 FR2)", () => {
    function RouterLink({ref, ...props}: React.ComponentPropsWithRef<'a'>) {
      return <a ref={ref} data-router-link {...props} />;
    }
    render(
      <LinkProvider component={RouterLink}>
        <Item
          label="Billing"
          href="/billing"
          target="_blank"
          rel="noopener"
          isDisabled
        />
        <Item label="Profile" href="/profile" />
      </LinkProvider>,
    );
    // No href, target or rel, so a screen reader's click, Enter or a link
    // menu cannot navigate; it keeps the link role and skips the router link.
    const disabled = screen.getByRole('link', {name: 'Billing'});
    expect(disabled).toHaveAttribute('aria-disabled', 'true');
    for (const attribute of ['href', 'target', 'rel', 'data-router-link']) {
      expect(disabled).not.toHaveAttribute(attribute);
    }
    const enabled = screen.getByRole('link', {name: 'Profile'});
    expect(enabled).toHaveAttribute('href', '/profile');
    expect(enabled).toHaveAttribute('data-router-link');
    expect(enabled).not.toHaveAttribute('aria-disabled');
  });

  it('keeps focus on a focused link row that becomes disabled (spec:AST-085 FR4)', () => {
    const {rerender} = render(<Item label="Billing" href="/billing" />);
    screen.getByRole('link', {name: 'Billing'}).focus();
    rerender(<Item label="Billing" href="/billing" isDisabled />);
    // The disabled row renders a plain anchor in place of the link component;
    // focus moves to it instead of falling to the page.
    const disabled = screen.getByRole('link', {name: 'Billing'});
    expect(disabled).not.toHaveAttribute('href');
    expect(disabled).toHaveFocus();
    rerender(<Item label="Billing" href="/billing" />);
    expect(screen.getByRole('link', {name: 'Billing'})).toHaveFocus();
  });

  it('does not pull focus back to a row that changes while focus is elsewhere', () => {
    const {rerender} = render(
      <>
        <Item label="Billing" href="/billing" />
        <button type="button">Elsewhere</button>
      </>,
    );
    screen.getByRole('button', {name: 'Elsewhere'}).focus();
    rerender(
      <>
        <Item label="Billing" href="/billing" isDisabled />
        <button type="button">Elsewhere</button>
      </>,
    );
    expect(screen.getByRole('button', {name: 'Elsewhere'})).toHaveFocus();
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
    // A bullet or caller-owned marker needs no extra formatting group: marker,
    // start, primary and end retain the released flat row structure.
    expect(root?.children).toHaveLength(4);
    expect(button?.parentElement).toBe(root);
    expect(screen.getByTestId('start').parentElement?.parentElement).toBe(root);
    expect(screen.getByTestId('end').parentElement?.parentElement).toBe(root);
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

  it('keeps its touch press layer to a press: on or fading', () => {
    render(<Item label="Row" onClick={() => {}} data-testid="row" />);
    // Under a coarse pointer the row's `::before` layer and its isolation
    // apply only on a press arm; at rest a caller's own `::before` keeps its
    // styles.
    expect(layerOnlyWhilePressed(screen.getByTestId('row'), '::before')).toBe(
      true,
    );
  });

  it('truncates the label and description to the lines it is given', () => {
    // The clamp count reaches CSS through a custom property, so resolve it.
    const lineClamp = (element: HTMLElement) => {
      const value = getComputedStyle(element)
        .getPropertyValue('-webkit-line-clamp')
        .trim();
      const variable = /^var\((--[^),]+)\)$/.exec(value)?.[1];
      return variable == null
        ? value
        : getComputedStyle(element).getPropertyValue(variable).trim() ||
            element.style.getPropertyValue(variable).trim();
    };
    // A node label wraps by default, so one line comes from labelLines.
    const {rerender} = render(
      <Item
        label={<span>A long label</span>}
        labelLines={1}
        description={<span>A long description</span>}
        descriptionLines={1}
      />,
    );
    for (const text of ['A long label', 'A long description']) {
      const style = getComputedStyle(screen.getByText(text).parentElement!);
      expect(style.overflow).toBe('hidden');
      expect(style.textOverflow).toBe('ellipsis');
      expect(style.whiteSpace).toBe('nowrap');
    }
    rerender(
      <Item
        label="A long label"
        labelLines={3}
        description="A long description"
        descriptionLines={2}
      />,
    );
    const label = screen.getByText('A long label');
    const description = screen.getByText('A long description');
    for (const element of [label, description]) {
      const style = getComputedStyle(element);
      expect(style.overflow).toBe('hidden');
      expect(style.display).toBe('-webkit-box');
      expect(style.whiteSpace).not.toBe('nowrap');
    }
    expect(lineClamp(label)).toBe('3');
    expect(lineClamp(description)).toBe('2');
  });

  it('reflects highlighted, selected, and disabled on the item theme target', () => {
    const {rerender} = render(<Item label="Item" data-testid="item" />);
    const item = () => screen.getByTestId('item');
    for (const state of ['highlighted', 'selected', 'disabled']) {
      expect(item()).not.toHaveAttribute(`data-${state}`);
    }
    rerender(
      <Item
        label="Item"
        isHighlighted
        isSelected
        isDisabled
        onClick={() => {}}
        data-testid="item"
      />,
    );
    expect(item()).toHaveClass('astryx-item');
    expect(item()).toHaveAttribute('data-highlighted', 'highlighted');
    expect(item()).toHaveAttribute('data-selected', 'selected');
    expect(item()).toHaveAttribute('data-disabled', 'disabled');
    rerender(<Item label="Item" role="option" isSelected data-testid="item" />);
    expect(item()).toHaveAttribute('data-selected', 'selected');
    expect(item()).not.toHaveAttribute('data-highlighted');
    expect(item()).not.toHaveAttribute('data-disabled');
    rerender(
      <Item label="Item" role="option" isHighlighted data-testid="item" />,
    );
    expect(item()).toHaveAttribute('data-highlighted', 'highlighted');
    expect(item()).not.toHaveAttribute('data-selected');
    expect(item()).not.toHaveAttribute('data-disabled');
    rerender(
      <Item label="Item" isDisabled onClick={() => {}} data-testid="item" />,
    );
    expect(item()).toHaveAttribute('data-disabled', 'disabled');
    expect(item()).not.toHaveAttribute('data-highlighted');
    expect(item()).not.toHaveAttribute('data-selected');
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

  it('groups only the numbered composing row, not marked Items in its slots', () => {
    render(
      <List listStyle="decimal">
        <ListItem
          data-testid="numbered-row"
          label="Numbered"
          startContent={<span data-testid="numbered-start">S</span>}
          endContent={
            <Item
              data-testid="nested-row"
              label="Nested item"
              marker={<span>•</span>}
              startContent={<span data-testid="nested-start">S</span>}
              endContent={<span>E</span>}
            />
          }
        />
      </List>,
    );
    const numbered = screen.getByTestId('numbered-row');
    expect(numbered.children).toHaveLength(2);
    const group = numbered.children[1];
    expect(
      screen.getByTestId('numbered-start').parentElement?.parentElement,
    ).toBe(group);
    const nested = screen.getByTestId('nested-row');
    expect(nested.children).toHaveLength(4);
    expect(
      screen.getByTestId('nested-start').parentElement?.parentElement,
    ).toBe(nested);
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

describe('swipe', () => {
  // The gesture system outlives a test (one per document) and keeps the time of
  // the touches it has seen. A document clock never runs backwards, so each
  // test's fake clock starts after the last one's.
  let epoch = 0;
  beforeEach(() => {
    // The suite answers as a phone (a coarse primary pointer), where Reduce
    // Motion cross-fades every change. `under a fine primary pointer` below
    // checks that a finger swipes there too, and a mouse never does.
    emulateTouch();
    // The gesture reads touch times, and the springs run on the document
    // clock and finish on timers: fake them all and move them together.
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
    epoch += 100_000;
    vi.advanceTimersByTime(epoch);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  interface Contact {
    id: number;
    x: number;
    y: number;
    target: Element;
  }

  /** The fingers down on the page, for each touch event's `touches`. */
  const down = new Map<number, Contact>();

  /**
   * A touch event as a phone sends it, stamped with the document clock. The
   * gesture system reads touches from touch events (jsdom has `ontouchstart`,
   * as a phone does), so a finger here is its touch events.
   */
  function sendTouch(
    type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel',
    contact: Contact,
    cancelable = type !== 'touchcancel',
  ): Event {
    const event = new Event(type, {
      bubbles: true,
      cancelable,
      composed: true,
    });
    const toTouch = (c: Contact) => ({
      identifier: c.id,
      clientX: c.x,
      clientY: c.y,
      target: c.target,
    });
    Object.defineProperty(event, 'changedTouches', {
      value: [toTouch(contact)],
    });
    Object.defineProperty(event, 'touches', {
      value: [...down.values()].map(toTouch),
    });
    Object.defineProperty(event, 'timeStamp', {value: performance.now()});
    contact.target.dispatchEvent(event);
    return event;
  }

  /**
   * One finger: `down` lands it, `move` slides it (16 ms per step, a frame),
   * `rest` holds it still. `up` lifts it, a frame later, or at once for a flick
   * that is still moving when it lifts. Each returns the event it sent, so a
   * test can ask whether the row cancelled it. A resting finger keeps reporting
   * where it is. That brings UIKit's velocity filter (the gesture system's)
   * down to rest: it never decays on its own.
   */
  function finger(target: Element, id = 1) {
    let contact: Contact = {id, x: 0, y: 10, target};
    const send = (
      type: Parameters<typeof sendTouch>[0],
      cancelable?: boolean,
    ) => {
      let event: Event | undefined;
      act(() => {
        event = sendTouch(type, contact, cancelable);
      });
      return event as Event;
    };
    /**
     * The finger's pointer event, which a browser sends before the touch event
     * of the same input. Where the primary pointer is fine, the press is what
     * installs the host's listeners.
     */
    const sendPointer = (type: string) => {
      const event = new PointerEvent(type, {
        bubbles: true,
        button: 0,
        buttons: type === 'pointerdown' || type === 'pointermove' ? 1 : 0,
        cancelable: true,
        clientX: contact.x,
        clientY: contact.y,
        composed: true,
        isPrimary: down.size === 0 || (down.size === 1 && down.has(id)),
        pointerId: 100 + id,
        pointerType: 'touch',
      });
      Object.defineProperty(event, 'timeStamp', {value: performance.now()});
      act(() => {
        contact.target.dispatchEvent(event);
      });
    };
    return {
      down(x: number, y = 10) {
        void act(() => vi.advanceTimersByTime(16));
        contact = {id, x, y, target};
        sendPointer('pointerdown');
        down.set(id, contact);
        return send('touchstart');
      },
      /** `cancelable: false`: the browser is already panning or zooming with this finger. */
      move(x: number, y = contact.y, {cancelable = true} = {}) {
        void act(() => vi.advanceTimersByTime(16));
        contact = {...contact, x, y};
        down.set(id, contact);
        sendPointer('pointermove');
        return send('touchmove', cancelable);
      },
      rest(ms = 320) {
        for (let t = 0; t < ms; t += 16) {
          void act(() => vi.advanceTimersByTime(16));
          sendPointer('pointermove');
          send('touchmove');
        }
      },
      up({afterMs = 16} = {}) {
        void act(() => vi.advanceTimersByTime(afterMs));
        sendPointer('pointerup');
        down.delete(id);
        return send('touchend');
      },
      cancel() {
        sendPointer('pointercancel');
        down.delete(id);
        return send('touchcancel');
      },
    };
  }
  afterEach(() => {
    down.clear();
  });

  /** Long enough for any settle to finish, and for what it lands to render. */
  const settled = async () => {
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
  };

  /**
   * Long enough for the row, on the tracking spring, to catch up with a
   * finger that stopped: the spring writes the travel frame by frame.
   */
  const caughtUp = () => {
    act(() => {
      vi.advanceTimersByTime(1500);
    });
  };

  /** Answer `prefers-reduced-motion: reduce` on top of the page's other answers. */
  const reduceMotion = () => {
    const matchMedia = window.matchMedia.bind(window);
    vi.stubGlobal('matchMedia', (query: string) => {
      const list = matchMedia(query);
      return query === '(prefers-reduced-motion: reduce)'
        ? {...list, matches: true}
        : list;
    });
  };

  /**
   * Where the row is: the travel the swipe writes on the root on every frame
   *, which every part's transform reads.
   */
  const xOf = (element: Element | null) =>
    parseFloat(
      (element as HTMLElement | null)?.style.getPropertyValue(
        '--_item-swipe-travel',
      ) || '0',
    );

  /** How far a full swipe has confirmed, as the swipe writes it on the root. */
  const confirmOf = (row: HTMLElement) =>
    parseFloat(row.style.getPropertyValue('--_item-swipe-confirm') || '0');

  /** The window of a side: the out-of-flow child of the root carrying it. */
  const panelOf = (row: HTMLElement, side: 'leading' | 'trailing') =>
    row.querySelector<HTMLElement>(`[data-swipe-panel="${side}"]`);
  const trackOf = (row: HTMLElement, side: 'leading' | 'trailing') =>
    panelOf(row, side)?.firstElementChild as HTMLElement;
  /** A side's entries: the track's children, each its own moving element. */
  const entriesOf = (row: HTMLElement, side: 'leading' | 'trailing') =>
    Array.from(trackOf(row, side)?.children ?? []) as HTMLElement[];

  /**
   * jsdom lays nothing out: give the row a width and each entry a natural
   * width of 72 px, as the real panel measures them.
   */
  function layOut(row: HTMLElement) {
    Object.defineProperty(row, 'clientWidth', {configurable: true, value: 300});
    for (const side of ['leading', 'trailing'] as const) {
      if (panelOf(row, side) == null) {
        continue;
      }
      for (const entry of entriesOf(row, side)) {
        Object.defineProperty(entry, 'offsetWidth', {
          configurable: true,
          value: 72,
        });
      }
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
    const {unmount} = render(
      <Item
        label="Conversation"
        onClick={onClick}
        data-testid="row"
        swipe={createSwipe({leading, trailing, swipeBehavior: behavior})}
      />,
    );
    const row = screen.getByTestId('row');
    layOut(row);
    return {row, onClick, unmount};
  }

  /**
   * A drag toward the leading side (rightward) by `travel` px of swipe, past
   * the 25 px the pan needs to begin, held still, then lifted.
   */
  function dragLeading(row: HTMLElement, travel: number) {
    const f = finger(row);
    f.down(10);
    f.move(20);
    f.move(35); // 25 px: the swipe begins here, at 0
    f.move(35 + travel / 2);
    f.move(35 + travel);
    f.rest();
    f.up();
    return f;
  }

  it('swipes on the first touch right after mount, with no import to wait for', async () => {
    // The first row with swipe actions in this file. A lazily loaded layer
    // would still be on its way here, and the touch would move nothing.
    const {row} = renderRow();
    dragLeading(row, 45);
    await settled();
    expect(xOf(row)).toBe(72);
  });

  it('is served on a role-less row and a listitem, and not on a row whose role forbids interactive descendants', () => {
    const actions = {leading: [{label: 'Unread', onActivate: vi.fn()}]};
    const {rerender} = render(
      <Item label="A" data-testid="row" swipe={createSwipe(actions)} />,
    );
    expect(panelOf(screen.getByTestId('row'), 'leading')).not.toBeNull();
    rerender(
      <Item as="li" label="A" data-testid="row" swipe={createSwipe(actions)} />,
    );
    expect(panelOf(screen.getByTestId('row'), 'leading')).not.toBeNull();
    for (const role of [
      'option',
      'menuitem',
      'menuitemcheckbox',
      'menuitemradio',
    ]) {
      rerender(
        <Item
          role={role}
          label="A"
          data-testid="row"
          swipe={createSwipe(actions)}
        />,
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
          swipe={createSwipe(actions)}
        />
      );
    }
    const {unmount} = render(<Delegating />);
    expect(panelOf(screen.getByTestId('row'), 'leading')).toBeNull();
    unmount();
    render(
      <Item
        label="A"
        data-testid="row"
        isDisabled
        swipe={createSwipe(actions)}
      />,
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
          swipe={createSwipe({
            trailing: [{label: 'Archive', onActivate: vi.fn()}],
          })}
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
    // The window clips to the row's resting box and takes no touch; the
    // track that paints sits beside it at rest, so nothing shows.
    const windowRules = rulesDeclaredFor(panel).join(';');
    expect(windowRules).toContain('overflow: clip');
    expect(windowRules).toContain('pointer-events: none');
    const trackRules = rulesDeclaredFor(trackOf(row, 'leading')).join(';');
    expect(trackRules).toContain('inset-inline-end: 100%');
    expect(trackRules).not.toContain('padding');
    // Nothing moved: the root carries no translation of the swipe's.
    expect(row.style.getPropertyValue('translate')).toBe('');
  });

  it('moves only by transforms that read one travel: the root, and a window, a track and entries that can never drift apart (spec:AST-057 FR2)', () => {
    const {row} = renderRow({
      leading: [
        {label: 'Unread', onActivate: vi.fn()},
        {label: 'Pin', onActivate: vi.fn()},
      ],
    });
    const f = finger(row);
    f.down(10);
    f.move(20);
    f.move(35);
    f.move(95);
    caughtUp();
    // 60 px of swipe toward the leading side (rightward), written on the
    // root as the one custom property every part reads.
    expect(xOf(row)).toBe(60);
    // The root moves by it. The window reads its negation, so it stays over the
    // resting box. The track moves with the row. Every entry stays pinned at
    // the outer edge until the row has uncovered them all, as one block with no
    // wrapper. The gesture wrote that geometry on the window: 144 px of
    // entries. The outermost adds its slide by the full swipe's confirm. No
    // entry's opacity reads the confirm: a cover hides the others at once.
    const travel = 'var(--_item-swipe-travel,0px)';
    const confirm = 'var(--_item-swipe-confirm,0)';
    const declared = (element: Element | null, property: string) =>
      rulesDeclaredFor(element as HTMLElement)
        .flatMap(rule =>
          rule.slice(rule.indexOf('{') + 1, rule.lastIndexOf('}')).split(';'),
        )
        .map(declaration => declaration.replace(/\s+/g, ''))
        .filter(declaration => declaration.startsWith(`${property}:`));
    const pinned = `calc(var(--_item-swipe-pin,0px)-var(--_item-swipe-sign,1)*min(var(--_item-swipe-sign,1)*${travel},var(--_item-swipe-open,0px)))`;
    expect(declared(row, 'transform')).toEqual([
      `transform:translate3d(${travel},0,0)`,
    ]);
    expect(declared(panelOf(row, 'leading'), 'transform')).toEqual([
      `transform:translate3d(calc(-1*${travel}),0,0)`,
    ]);
    expect(declared(trackOf(row, 'leading'), 'transform')).toEqual([
      `transform:translate3d(${travel},0,0)`,
    ]);
    const [other, outermost] = entriesOf(row, 'leading');
    expect(declared(other, 'transform')).toEqual([
      `transform:translate3d(${pinned},0,0)`,
    ]);
    expect(declared(other, 'opacity')).toEqual([]);
    expect(declared(outermost, 'transform')).toEqual([
      `transform:translate3d(calc(${pinned}+var(--_item-swipe-slide,0px)*${confirm}),0,0)`,
    ]);
    const geometry = (panelOf(row, 'leading') as HTMLElement).style;
    expect(geometry.getPropertyValue('--_item-swipe-pin')).toBe('144px');
    expect(geometry.getPropertyValue('--_item-swipe-sign')).toBe('1');
    expect(geometry.getPropertyValue('--_item-swipe-open')).toBe('144px');
    expect(geometry.getPropertyValue('--_item-swipe-slide')).toBe('72px');
    // No layout property is ever written, nor a transform of its own.
    for (const element of [
      row,
      panelOf(row, 'leading'),
      trackOf(row, 'leading'),
      ...entriesOf(row, 'leading'),
    ]) {
      const style = (element as HTMLElement).style;
      expect(style.width).toBe('');
      expect(style.left).toBe('');
      expect(style.transform).toBe('');
      expect(style.translate).toBe('');
    }
    f.up();
  });

  it("claims the touch at 8 px, before a browser would scroll it, and moves the row only past UIKit's 25 px, from 0", () => {
    const {row} = renderRow();
    const f = finger(row);
    f.down(10);
    // Short of the claim the scroller may still take the touch: the
    // default stands.
    expect(f.move(15).defaultPrevented).toBe(false);
    // 10 px, mostly sideways: the row's. Every further touchmove is cancelled.
    // That keeps a browser from scrolling a drag that is not perfectly level:
    // iOS Safari commits at about 10 px.
    expect(f.move(20, 12).defaultPrevented).toBe(true);
    // The swipe itself has not begun: the row has not moved.
    expect(f.move(34, 13).defaultPrevented).toBe(true);
    expect(row.style.getPropertyValue('--_item-swipe-travel')).toBe('');
    // 25 px: the swipe begins, at 0 (the threshold's travel is not part of
    // it, as in UIKit).
    expect(f.move(35, 14).defaultPrevented).toBe(true);
    expect(xOf(row)).toBe(0);
    expect(f.move(55, 16).defaultPrevented).toBe(true);
    caughtUp();
    expect(xOf(row)).toBe(20);
    // The row owned the touch, so the lift is cancelled too: no click is
    // synthesized from it.
    expect(f.up().defaultPrevented).toBe(true);
  });

  it('counts the swipe from where the finger crossed the threshold, so coming back past the start moves nothing', () => {
    const {row} = renderRow();
    const f = finger(row);
    f.down(10);
    f.move(20);
    f.move(35);
    f.move(60);
    caughtUp();
    expect(xOf(row)).toBe(25);
    // Back to 10 px short of the touch-down point: the row heads home, and
    // stays there rather than counting the threshold the other way.
    f.move(20);
    caughtUp();
    expect(xOf(row)).toBe(0);
    f.move(4);
    caughtUp();
    expect(xOf(row)).toBe(0);
    f.up();
  });

  describe('under a fine primary pointer (a touchscreen laptop, a mouse)', () => {
    // The rest of the suite answers as a phone; here the primary pointer is
    // fine. The gesture reads each touch's pointer: a finger
    // swipes the row whatever the primary pointer, and a mouse never does.
    beforeEach(() => {
      vi.unstubAllGlobals();
    });

    it('swipes under a finger, claiming the touch and resting open as on a phone', async () => {
      // A fine primary pointer in this context, before anything is checked.
      expect(window.matchMedia('(pointer: coarse)').matches).toBe(false);
      const {row} = renderRow();
      expect(panelOf(row, 'leading')).toHaveAttribute('inert');
      const f = finger(row);
      f.down(10);
      // Claimed at 8 px, before a browser would scroll it.
      expect(f.move(20).defaultPrevented).toBe(true);
      f.move(35);
      f.move(80);
      f.rest();
      f.up();
      await settled();
      expect(xOf(row)).toBe(72);
      expect(panelOf(row, 'leading')).not.toHaveAttribute('inert');
    });

    it('swipes under a finger beside another recognizer, which a finger works too: gestures attach for every pointer (spec:AST-094 FR43)', async () => {
      expect(window.matchMedia('(pointer: coarse)').matches).toBe(false);
      const taps: string[] = [];
      function Other() {
        const ref = useRef<HTMLDivElement>(null);
        useGestureRecognizer(
          ref,
          () => new TapGestureRecognizer({name: 'test-other-tap'}),
          tap => {
            taps.push(tap.state);
          },
        );
        return <div ref={ref} data-testid="other" />;
      }
      const {row} = renderRow();
      render(<Other />);
      const t = finger(screen.getByTestId('other'), 3);
      t.down(20);
      t.up();
      expect(taps).toContain('ended');
      // The row swipes under a finger beside it.
      dragLeading(row, 45);
      await settled();
      expect(xOf(row)).toBe(72);
    });

    it('closes a row a finger opened on a tap on its content, as on a phone', async () => {
      expect(window.matchMedia('(pointer: coarse)').matches).toBe(false);
      const {row, onClick} = renderRow();
      dragLeading(row, 45);
      await settled();
      expect(xOf(row)).toBe(72);
      const f = finger(screen.getByRole('button', {name: 'Conversation'}), 2);
      f.down(150);
      // Taken at the lift: no click reaches the row.
      expect(f.up().defaultPrevented).toBe(true);
      await settled();
      expect(xOf(row)).toBe(0);
      expect(onClick).not.toHaveBeenCalled();
    });

    it.each(['mouse', 'pen'] as const)(
      'closes a row a finger opened on a %s press on its content, and the click that press makes activates nothing',
      async pointerType => {
        expect(window.matchMedia('(pointer: coarse)').matches).toBe(false);
        const {row, onClick} = renderRow();
        dragLeading(row, 45);
        await settled();
        expect(xOf(row)).toBe(72);
        const content = screen.getByRole('button', {name: 'Conversation'});
        const press = (type: string) =>
          act(() => {
            content.dispatchEvent(
              new PointerEvent(type, {
                bubbles: true,
                button: 0,
                buttons: type === 'pointerdown' ? 1 : 0,
                cancelable: true,
                clientX: 150,
                clientY: 10,
                composed: true,
                isPrimary: true,
                pointerId: 9,
                pointerType,
              }),
            );
          });
        press('pointerdown');
        void act(() => vi.advanceTimersByTime(16));
        press('pointerup');
        // The browser's click for that press.
        fireEvent.click(content, {detail: 1});
        await settled();
        expect(xOf(row)).toBe(0);
        expect(onClick).not.toHaveBeenCalled();
      },
    );

    it('never swipes under a mouse', async () => {
      expect(window.matchMedia('(pointer: coarse)').matches).toBe(false);
      const {row} = renderRow();
      const mouse = (type: string, x: number) =>
        act(() => {
          row.dispatchEvent(
            new PointerEvent(type, {
              bubbles: true,
              button: 0,
              buttons: type === 'pointerup' ? 0 : 1,
              clientX: x,
              clientY: 10,
              pointerId: 1,
              pointerType: 'mouse',
            }),
          );
        });
      mouse('pointerdown', 10);
      mouse('pointermove', 60);
      mouse('pointermove', 120);
      mouse('pointerup', 120);
      await settled();
      expect(xOf(row)).toBe(0);
      expect(panelOf(row, 'leading')).toHaveAttribute('inert');
    });
  });

  it('leaves the row as it was when a claimed touch lifts before the swipe begins', async () => {
    const {row} = renderRow();
    const f = finger(row);
    f.down(10);
    f.move(30);
    expect(f.up().defaultPrevented).toBe(true);
    expect(row.style.getPropertyValue('translate')).toBe('');
    expect(panelOf(row, 'leading')).toHaveAttribute('inert');
    // An open row stays open, its panel live.
    dragLeading(row, 45);
    await settled();
    expect(xOf(row)).toBe(72);
    const g = finger(row);
    g.down(150);
    g.move(135);
    g.up();
    await settled();
    expect(xOf(row)).toBe(72);
    expect(panelOf(row, 'leading')).not.toHaveAttribute('inert');
  });

  it('keeps the rest a settle lands while a claimed touch holds the row, when that touch lifts before the swipe begins', async () => {
    const {row} = renderRow();
    // Released past half the panel: the row settles open.
    dragLeading(row, 45);
    // While it settles, a finger claims it and holds short of the swipe.
    const f = finger(row);
    f.down(150);
    f.move(160);
    // The settle lands under the held finger.
    await settled();
    expect(xOf(row)).toBe(72);
    f.up();
    await settled();
    // The row rests open, its panel live, and it still closes.
    expect(xOf(row)).toBe(72);
    expect(panelOf(row, 'leading')).not.toHaveAttribute('inert');
    const button = screen.getByRole('button', {name: 'Unread'});
    button.focus();
    fireEvent.keyDown(button, {key: 'Escape'});
    await settled();
    expect(xOf(row)).toBe(0);
  });

  it('springs back when the browser cancels a swipe in progress', async () => {
    const onActivate = vi.fn();
    const {row} = renderRow({leading: [{label: 'Unread', onActivate}]});
    const f = finger(row);
    f.down(10);
    f.move(20);
    f.move(35);
    f.move(95);
    caughtUp();
    expect(xOf(row)).toBe(60);
    f.cancel();
    await settled();
    expect(xOf(row)).toBe(0);
    expect(panelOf(row, 'leading')).toHaveAttribute('inert');
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('leaves a mostly vertical drag to the scroller and never cancels its touchmove', () => {
    const {row} = renderRow();
    const f = finger(row);
    f.down(10, 10);
    expect(f.move(14, 40).defaultPrevented).toBe(false);
    expect(f.move(60, 200).defaultPrevented).toBe(false);
    expect(row.style.getPropertyValue('translate')).toBe('');
    expect(f.up().defaultPrevented).toBe(false);
  });

  it('ignores a mouse', () => {
    const {row} = renderRow();
    const mouse = (type: string, x: number) =>
      act(() => {
        row.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            button: 0,
            buttons: type === 'pointerup' ? 0 : 1,
            clientX: x,
            clientY: 10,
            pointerId: 1,
            pointerType: 'mouse',
          }),
        );
      });
    mouse('pointerdown', 10);
    mouse('pointermove', 60);
    mouse('pointermove', 120);
    expect(row.style.getPropertyValue('translate')).toBe('');
    mouse('pointerup', 120);
  });

  it('does not move toward a side without entries', () => {
    const {row} = renderRow({
      leading: [{label: 'Unread', onActivate: vi.fn()}],
    });
    const f = finger(row);
    f.down(200);
    f.move(180);
    expect(f.move(150).defaultPrevented).toBe(false);
    expect(row.style.getPropertyValue('translate')).toBe('');
    f.up();
  });

  describe('a pinch', () => {
    it('lets the touch go when a second finger lands before the swipe begins', () => {
      const {row} = renderRow();
      const first = finger(row, 1);
      const second = finger(row, 2);
      first.down(100);
      second.down(60);
      // The fingers spread apart; the first one travels toward the leading
      // side far past the threshold.
      first.move(130);
      second.move(30);
      expect(first.move(160).defaultPrevented).toBe(false);
      expect(row.style.getPropertyValue('translate')).toBe('');
      first.up();
      second.up();
    });

    it('lets the touch go when the second finger lands off the row and the browser zooms', () => {
      const {row} = renderRow();
      const first = finger(row, 1);
      const second = finger(document.body, 2);
      first.down(100);
      second.down(60, 200);
      // The browser starts its pinch: it cancels the fingers' pointers, as
      // Chromium does. From here on it no longer asks the page whether it may,
      // so the moves arrive uncancelable.
      act(() => {
        const cancel = new PointerEvent('pointercancel', {
          bubbles: true,
          clientX: 100,
          clientY: 10,
          pointerId: 99,
          pointerType: 'touch',
        });
        Object.defineProperty(cancel, 'timeStamp', {value: performance.now()});
        row.dispatchEvent(cancel);
      });
      first.move(110, 10, {cancelable: false});
      first.move(130, 10, {cancelable: false});
      first.move(160, 10, {cancelable: false});
      expect(row.style.getPropertyValue('translate')).toBe('');
      first.up();
      second.up();
    });

    it('never starts a swipe from a second finger whose first finger is off the row: the pinch stays the page’s (spec:AST-094 FR10)', () => {
      const {row} = renderRow();
      // The first finger is somewhere else on the page; the second lands on
      // the row and travels sideways, past the claim and the swipe.
      const first = finger(document.body, 1);
      const second = finger(row, 2);
      first.down(60, 200);
      second.down(100);
      second.move(110);
      second.move(130);
      expect(second.move(160).defaultPrevented).toBe(false);
      expect(xOf(row)).toBe(0);
      second.up();
      first.up();
    });

    it('keeps a begun swipe when a second finger lands: the row stays on its finger, which it keeps from the browser (spec:AST-094 FR10)', async () => {
      const {row} = renderRow();
      const first = finger(row, 1);
      const second = finger(row, 2);
      first.down(10);
      first.move(20);
      first.move(35);
      first.move(55);
      caughtUp();
      expect(xOf(row)).toBe(20);
      second.down(200);
      // A second finger neither cancels nor redirects a claimed drag: the
      // row's finger is still the row's, its moves still cancelled.
      expect(first.move(75).defaultPrevented).toBe(true);
      caughtUp();
      expect(xOf(row)).toBe(40);
      second.up();
      first.rest();
      first.up();
      await settled();
      // Released held at 40 px of a 72 px panel: past half, it rests open.
      expect(xOf(row)).toBe(72);
    });
  });

  describe('reveal (the default)', () => {
    it('springs back when released short of half the panel', async () => {
      const {row} = renderRow();
      dragLeading(row, 30);
      // 30 px of a 72 px panel, released at rest: short.
      await settled();
      expect(xOf(row)).toBe(0);
      expect(panelOf(row, 'leading')).toHaveAttribute('inert');
    });

    it('rests open past half the panel, with every entry a real button, and fires a tapped entry', async () => {
      const onActivate = vi.fn();
      const onClick = vi.fn();
      const {row} = renderRow({
        leading: [{label: 'Unread', onActivate}],
        onClick,
      });
      dragLeading(row, 45);
      await settled();
      // Resting at the panel's width; the panel is live.
      expect(xOf(row)).toBe(72);
      const panel = panelOf(row, 'leading') as HTMLElement;
      expect(panel).not.toHaveAttribute('inert');
      const button = screen.getByRole('button', {name: 'Unread'});
      expect(button).toBeVisible();
      // A tap fires it at once; without `hasRemoval` the row closes.
      fireEvent.click(button);
      expect(onActivate).toHaveBeenCalledTimes(1);
      await settled();
      expect(xOf(row)).toBe(0);
      expect(panel).toHaveAttribute('inert');
      // The row's own primary never fired.
      expect(onClick).not.toHaveBeenCalled();
    });

    it('keeps a disabled entry focusable but inert on an open row (spec:AST-085 FR1, FR2)', async () => {
      const onActivate = vi.fn();
      const onClick = vi.fn();
      const {row} = renderRow({
        leading: [{label: 'Unread', onActivate, isDisabled: true}],
        onClick,
      });
      dragLeading(row, 45);
      await settled();
      expect(xOf(row)).toBe(72);
      const button = screen.getByRole('button', {name: 'Unread'});
      // Exposed through aria-disabled, never the native attribute, so it
      // keeps its place in the focus order.
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button).not.toHaveAttribute('disabled');
      button.focus();
      expect(button).toHaveFocus();
      // Inert: the click Enter and Space send runs nothing, leaves the row
      // open, and does not reach the row's own primary.
      fireEvent.click(button);
      await settled();
      expect(onActivate).not.toHaveBeenCalled();
      expect(xOf(row)).toBe(72);
      expect(onClick).not.toHaveBeenCalled();
    });

    it('fires a tapped entry while the row is still springing open: the row is open from its release', async () => {
      const onActivate = vi.fn();
      const onClick = vi.fn();
      const {row} = renderRow({
        leading: [{label: 'Unread', onActivate}],
        onClick,
      });
      dragLeading(row, 45);
      // Released past half the panel 16 ms ago, the settle has hundreds of
      // milliseconds left. Yet the row already counts as open, so its panel is
      // live and an entry tapped now fires.
      const panel = panelOf(row, 'leading') as HTMLElement;
      expect(panel).not.toHaveAttribute('inert');
      fireEvent.click(screen.getByRole('button', {name: 'Unread'}));
      expect(onActivate).toHaveBeenCalledTimes(1);
      await settled();
      expect(xOf(row)).toBe(0);
      expect(onClick).not.toHaveBeenCalled();
    });

    it('opens on a flick from short of half the panel, and fires nothing', async () => {
      const onActivate = vi.fn();
      const {row} = renderRow({leading: [{label: 'Unread', onActivate}]});
      const f = finger(row);
      f.down(10);
      f.move(25);
      f.move(40);
      // 12 px of swipe, still moving at about 850 px/s when it lifts: the
      // release projects far past half the panel.
      f.move(52);
      f.up({afterMs: 0});
      await settled();
      expect(xOf(row)).toBe(72);
      expect(onActivate).not.toHaveBeenCalled();
    });

    it('closes an open row on a flick back, even from past half the panel', async () => {
      const {row} = renderRow();
      dragLeading(row, 45);
      await settled();
      expect(xOf(row)).toBe(72);
      const f = finger(row);
      f.down(150);
      f.move(140);
      f.move(125); // 25 px: the swipe begins where the row is
      f.move(110);
      f.up({afterMs: 0});
      await settled();
      expect(xOf(row)).toBe(0);
    });

    it('catches a settling row where it is, without a jump', async () => {
      const {row} = renderRow();
      const f = finger(row);
      f.down(10);
      f.move(25);
      f.move(40);
      f.move(55);
      f.up({afterMs: 0});
      // A flick: the row is on its way to 72 px. A finger lands 100 ms in.
      void act(() => vi.advanceTimersByTime(100));
      const g = finger(row);
      g.down(150);
      g.move(160);
      g.move(175);
      // The swipe began: the row heads for where it was when the finger
      // caught it, neither back to 15 nor on to 72.
      caughtUp();
      const caught = xOf(row);
      expect(caught).toBeGreaterThan(15);
      expect(caught).toBeLessThan(72);
      g.move(185);
      caughtUp();
      expect(xOf(row)).toBeCloseTo(caught + 10, 2);
      g.rest();
      g.up();
      await settled();
      expect(xOf(row)).toBe(72);
    });

    it("holds the row out after a tapped entry with hasRemoval, and fires it once the row's content has left its box (spec:AST-057 FR5)", async () => {
      const onActivate = vi.fn();
      const {row} = renderRow({
        trailing: [{label: 'Archive', onActivate, hasRemoval: true}],
        leading: [],
      });
      const f = finger(row);
      f.down(200);
      f.move(185);
      f.move(170);
      f.move(150);
      f.move(130);
      f.rest();
      f.up();
      await settled();
      expect(xOf(row)).toBe(-72);
      fireEvent.click(screen.getByRole('button', {name: 'Archive'}));
      // Not at the tap: the row slides out first, and the entry fires once the
      // row's content has left its box (300 px). So a row its app removes at
      // once never vanishes mid-slide. From rest at 72 px the settle passes 300
      // px about 0.4 s in, on its way to 324 px.
      expect(onActivate).not.toHaveBeenCalled();
      await act(async () => {
        vi.advanceTimersByTime(300);
      });
      expect(onActivate).not.toHaveBeenCalled();
      await act(async () => {
        vi.advanceTimersByTime(150);
      });
      expect(onActivate).toHaveBeenCalledTimes(1);
      await settled();
      expect(onActivate).toHaveBeenCalledTimes(1);
      // Out past the edge it travelled toward, and staying there: the
      // caller removes the row, or it sits off-screen (their bug).
      expect(xOf(row)).toBe(-324);
      await settled();
      expect(xOf(row)).toBe(-324);
      // A row that is out takes no swipe.
      const g = finger(row);
      g.down(100);
      g.move(130);
      expect(g.move(160).defaultPrevented).toBe(false);
      g.up();
    });

    it('keeps the other side’s panel inert while the row rests open: only the open side’s entries are in the tab order and the accessibility tree', async () => {
      const {row} = renderRow({
        leading: [{label: 'Unread', onActivate: vi.fn()}],
        trailing: [
          {label: 'Delete', onActivate: vi.fn(), variant: 'destructive'},
        ],
      });
      dragLeading(row, 45);
      await settled();
      expect(xOf(row)).toBe(72);
      expect(panelOf(row, 'leading')).not.toHaveAttribute('inert');
      // The trailing panel is out of sight behind the row: nothing in it
      // takes focus or reaches assistive technology.
      expect(panelOf(row, 'trailing')).toHaveAttribute('inert');
    });

    it('cross-fades a release under Reduce Motion instead of springing: it lands when the fade is over', async () => {
      // Astryx's Reduce Motion rules govern where UIKit keeps its spring. The
      // finger's own drag is direct manipulation, and what its release starts
      // cross-fades.
      reduceMotion();
      const {row} = renderRow();
      dragLeading(row, 45);
      await act(async () => {
        vi.advanceTimersByTime(16);
      });
      // Mid-fade the row has not travelled: it lands at the bottom of the
      // dip. It is open from its release, as after a spring, so its panel is
      // already live.
      expect(xOf(row)).toBe(45);
      expect(panelOf(row, 'leading')).not.toHaveAttribute('inert');
      await act(async () => {
        vi.advanceTimersByTime(534);
      });
      expect(xOf(row)).toBe(72);
      expect(panelOf(row, 'leading')).not.toHaveAttribute('inert');
    });

    it('closes a resting row on a pointer outside it, and on Escape with focus inside', async () => {
      const {row} = renderRow();
      const open = async () => {
        dragLeading(row, 45);
        await settled();
        expect(xOf(row)).toBe(72);
      };
      await open();
      // A drag on a neighbour is a pointer outside this row.
      fireEvent.pointerDown(document.body, {
        pointerId: 9,
        pointerType: 'touch',
      });
      await settled();
      expect(xOf(row)).toBe(0);
      await open();
      const button = screen.getByRole('button', {name: 'Unread'});
      button.focus();
      fireEvent.keyDown(button, {key: 'Escape'});
      await settled();
      expect(xOf(row)).toBe(0);
      // Focus lands on the row's own content, not on a now-inert button.
      expect(document.activeElement).toBe(
        screen.getByRole('button', {name: 'Conversation'}),
      );
    });

    it('closes a resting row on a tap on its own content, and the tap activates nothing', async () => {
      const {row, onClick} = renderRow();
      dragLeading(row, 45);
      await settled();
      expect(xOf(row)).toBe(72);
      const f = finger(screen.getByRole('button', {name: 'Conversation'}), 2);
      f.down(150);
      // Taken at the lift: its touchend is cancelled, so the browser makes no
      // click on the row.
      expect(f.up().defaultPrevented).toBe(true);
      await settled();
      expect(xOf(row)).toBe(0);
      expect(onClick).not.toHaveBeenCalled();
    });

    it('leaves activation without a touch unchanged while open: Enter, or a click with no touch before it (a screen reader’s), activates the row, which stays open (spec:AST-057 AR3)', async () => {
      const {row, onClick} = renderRow();
      dragLeading(row, 45);
      await settled();
      expect(xOf(row)).toBe(72);
      const content = screen.getByRole('button', {name: 'Conversation'});
      act(() => {
        content.focus();
      });
      // Enter on a focused button: the browser clicks it, with no pointer.
      fireEvent.keyDown(content, {key: 'Enter'});
      fireEvent.click(content, {detail: 0});
      fireEvent.keyUp(content, {key: 'Enter'});
      expect(onClick).toHaveBeenCalledTimes(1);
      // VoiceOver and TalkBack activate with a click and no press: only a press
      // on the content closes the row.
      fireEvent.click(content);
      expect(onClick).toHaveBeenCalledTimes(2);
      await settled();
      expect(xOf(row)).toBe(72);
    });

    it('counts a row open from the release that opens it: a tap while it settles open closes it', async () => {
      const {row, onClick} = renderRow();
      dragLeading(row, 45);
      // The spring is still on its way to rest open.
      const f = finger(screen.getByRole('button', {name: 'Conversation'}), 2);
      f.down(150);
      expect(f.up().defaultPrevented).toBe(true);
      await settled();
      expect(xOf(row)).toBe(0);
      expect(onClick).not.toHaveBeenCalled();
    });

    it('takes no press while open: the root holds its press from the release that opens it until it closes', async () => {
      const {row} = renderRow();
      expect(row).toHaveAttribute('data-astryx-pressable');
      expect(row).not.toHaveAttribute('data-astryx-press-held');
      dragLeading(row, 45);
      // Settling open already counts as open. The root stays a pressable
      // surface; the press controller paints nothing on a held one.
      expect(row).toHaveAttribute('data-astryx-press-held');
      expect(row).toHaveAttribute('data-astryx-pressable');
      await settled();
      expect(xOf(row)).toBe(72);
      expect(row).toHaveAttribute('data-astryx-press-held');
      const f = finger(screen.getByRole('button', {name: 'Conversation'}), 2);
      f.down(150);
      f.up();
      // Closing: the press is free again, for the next tap.
      expect(row).not.toHaveAttribute('data-astryx-press-held');
      await settled();
      expect(xOf(row)).toBe(0);
    });

    it('leaves a tap on a resting entry to the entry, and a tap on a closed row to the row', async () => {
      const {row} = renderRow();
      let f = finger(screen.getByRole('button', {name: 'Conversation'}), 2);
      f.down(150);
      expect(f.up().defaultPrevented).toBe(false);
      dragLeading(row, 45);
      await settled();
      f = finger(screen.getByRole('button', {name: 'Unread'}), 3);
      f.down(30);
      expect(f.up().defaultPrevented).toBe(false);
      expect(xOf(row)).toBe(72);
    });

    it('stays open on a scroll while focus is inside its open panel, which may be the browser bringing a focused entry into view', async () => {
      const {row} = renderRow();
      dragLeading(row, 45);
      await settled();
      const entry = screen.getByRole('button', {name: 'Unread'});
      act(() => {
        entry.focus();
      });
      fireEvent.scroll(row.parentElement as HTMLElement);
      await settled();
      expect(xOf(row)).toBe(72);
      expect(document.activeElement).toBe(entry);
    });

    it("closes on a pointer outside it and on a scroll that an app's later window listener stops", async () => {
      const {row} = renderRow();
      const stop = (event: Event) => {
        event.stopPropagation();
      };
      dragLeading(row, 45);
      await settled();
      // The open row hears document-wide input through the shared input
      // stream. Its window listener runs before one an app adds later.
      window.addEventListener('pointerdown', stop, true);
      try {
        fireEvent.pointerDown(document.body, {
          pointerId: 9,
          pointerType: 'touch',
        });
        await settled();
      } finally {
        window.removeEventListener('pointerdown', stop, true);
      }
      expect(xOf(row)).toBe(0);
      dragLeading(row, 45);
      await settled();
      expect(xOf(row)).toBe(72);
      window.addEventListener('scroll', stop, true);
      try {
        fireEvent.scroll(row.parentElement as HTMLElement);
        await settled();
      } finally {
        window.removeEventListener('scroll', stop, true);
      }
      expect(xOf(row)).toBe(0);
    });

    it('closes on a press outside it that lands in the same task as the release that opens it', async () => {
      const {row} = renderRow();
      // React runs no Effect until this act ends. So only the transition that
      // the release makes can have subscribed the row's closes by the press.
      act(() => {
        dragLeading(row, 45);
        fireEvent.pointerDown(document.body, {
          pointerId: 9,
          pointerType: 'touch',
        });
      });
      await settled();
      expect(xOf(row)).toBe(0);
    });

    it('closes on a scroll while focus is on its content, outside its open panel (spec:AST-057 FR7)', async () => {
      const {row} = renderRow();
      dragLeading(row, 45);
      await settled();
      const content = screen.getByRole('button', {name: 'Conversation'});
      act(() => {
        content.focus();
      });
      fireEvent.scroll(row.parentElement as HTMLElement);
      await settled();
      expect(xOf(row)).toBe(0);
    });

    it('closes a resting row when anything holding it scrolls, and not for another scroller', async () => {
      const {row} = renderRow();
      dragLeading(row, 45);
      await settled();
      const elsewhere = document.createElement('div');
      document.body.append(elsewhere);
      fireEvent.scroll(elsewhere);
      await settled();
      expect(xOf(row)).toBe(72);
      // The row's parent stands in for the list: it scrolls, the row closes.
      fireEvent.scroll(row.parentElement as HTMLElement);
      await settled();
      expect(xOf(row)).toBe(0);
      elsewhere.remove();
    });

    it('opens a two-entry side on a full swipe from closed and fires nothing; from the open row it fires the outermost entry and no other, then springs back', async () => {
      const inner = vi.fn();
      const outer = vi.fn();
      const {row} = renderRow({
        leading: [
          {label: 'Unread', onActivate: inner},
          {label: 'Pin', onActivate: outer},
        ],
      });
      // Two entries: a 144 px panel. The full swipe confirms 0.69 of the way
      // from it to 271 px (the 300 px row less 29): about 232 px. From the
      // closed row it does not confirm: the row rests open.
      dragLeading(row, 240);
      await settled();
      expect(xOf(row)).toBe(144);
      expect(outer).not.toHaveBeenCalled();
      // From the open row, 96 px more reaches 240 px: it confirms.
      dragLeading(row, 96);
      expect(outer).not.toHaveBeenCalled();
      // The row slides out, past its box (300 px). jsdom plays no animation, so
      // the travel is the slide-out's end at once; the interaction proofs
      // follow it frame by frame. The entry fires once the content has left its
      // box.
      await act(async () => {
        vi.advanceTimersByTime(100);
      });
      expect(xOf(row)).toBeGreaterThan(300);
      await settled();
      expect(outer).toHaveBeenCalledTimes(1);
      expect(inner).not.toHaveBeenCalled();
      // No `hasRemoval`: back home.
      await settled();
      expect(xOf(row)).toBe(0);
    });

    it('fires the outermost entry from a drag that starts on that entry while the row rests open, and fires no other', async () => {
      const inner = vi.fn();
      const outer = vi.fn();
      const {row} = renderRow({
        leading: [
          {label: 'Unread', onActivate: inner},
          {label: 'Pin', onActivate: outer},
        ],
      });
      dragLeading(row, 90);
      await settled();
      expect(xOf(row)).toBe(144);
      // The finger lands on the outermost entry itself, then drags on past the
      // confirm point.
      const f = finger(screen.getByRole('button', {name: 'Pin'}));
      f.down(10);
      f.move(20);
      f.move(35);
      f.move(35 + 48);
      f.move(35 + 96);
      f.rest();
      f.up();
      expect(outer).not.toHaveBeenCalled();
      await act(async () => {
        vi.advanceTimersByTime(100);
      });
      expect(xOf(row)).toBeGreaterThan(300);
      await settled();
      expect(outer).toHaveBeenCalledTimes(1);
      expect(inner).not.toHaveBeenCalled();
    });

    describe('the full swipe', () => {
      const twoEntries = () =>
        renderRow({
          leading: [
            {label: 'Unread', onActivate: vi.fn()},
            {label: 'Pin', onActivate: vi.fn()},
          ],
        });
      /**
       * A row resting open at a side's 144 px of entries. A side with two
       * entries confirms a full swipe only from there.
       */
      const openRow = (row: HTMLElement) => {
        dragLeading(row, 90);
        caughtUp();
        expect(xOf(row)).toBe(144);
      };
      it('lets the entries ride the row past the open width, the outermost stretching to the edge', () => {
        const {row} = twoEntries();
        // Where the entries' transform puts them against the track, from the
        // travel and the side's geometry the swipe writes. It is
        // SwipeActionsLayer's rule, which a browser computes; jsdom computes no
        // calc().
        const entriesX = () => {
          const style = (panelOf(row, 'leading') as HTMLElement).style;
          const read = (name: string) =>
            parseFloat(style.getPropertyValue(name));
          const sign = read('--_item-swipe-sign');
          return (
            read('--_item-swipe-pin') -
            sign * Math.min(sign * xOf(row), read('--_item-swipe-open'))
          );
        };
        const f = finger(row);
        f.down(10);
        f.move(20);
        f.move(35);
        f.move(35 + 100);
        caughtUp();
        // Short of the open width: every entry pinned at the outer edge.
        expect(entriesX()).toBe(44);
        f.move(35 + 200);
        caughtUp();
        // Past it: beside the row, the outermost entry's colour filling out
        // to the edge.
        expect(entriesX()).toBe(0);
        f.up();
      });

      it("confirms on the finger's travel from the open row: the row runs ahead to the confirmation offset, the outermost entry covers the space, and the other hides at once", () => {
        const {row} = twoEntries();
        openRow(row);
        const [other] = entriesOf(row, 'leading');
        const isHidden = (element: Element) =>
          rulesDeclaredFor(element).some(rule => rule.includes('opacity: 0'));
        const f = finger(row);
        f.down(10);
        f.move(20);
        f.move(35);
        // From the row's 144 px: 76 px more is 220 px.
        f.move(35 + 76);
        caughtUp();
        // Not yet: the row follows the finger.
        expect(xOf(row)).toBe(220);
        expect(confirmOf(row)).toBe(0);
        expect(isHidden(other)).toBe(false);
        f.move(35 + 96);
        caughtUp();
        // Confirmed: ahead to 271 px, the 300 px row less 29. The outermost
        // entry slid by its full slide past the other, to the row's edge (72
        // px, the side's geometry). The other hides behind its cover.
        expect(xOf(row)).toBe(271);
        expect(confirmOf(row)).toBe(1);
        expect(isHidden(other)).toBe(true);
        expect(
          (panelOf(row, 'leading') as HTMLElement).style.getPropertyValue(
            '--_item-swipe-slide',
          ),
        ).toBe('72px');
        // Backed out: the look undone, the row on the finger again.
        f.move(35 + 56);
        caughtUp();
        expect(xOf(row)).toBe(200);
        expect(confirmOf(row)).toBe(0);
        expect(isHidden(other)).toBe(false);
        f.up();
      });

      describe('the cover', () => {
        const isHidden = (element: Element) =>
          rulesDeclaredFor(element).some(rule => rule.includes('opacity: 0'));
        const isCovered = (row: HTMLElement) =>
          rulesDeclaredFor(trackOf(row, 'leading')).some(
            rule => rule.includes('::before') && rule.includes('opacity: 1'),
          );

        it('keeps the outermost entry over the panel from the confirm until the row is home, with no frame of the other', async () => {
          const outer = vi.fn();
          const {row} = renderRow({
            leading: [
              {label: 'Unread', onActivate: vi.fn()},
              {label: 'Pin', onActivate: outer},
            ],
          });
          openRow(row);
          const [other] = entriesOf(row, 'leading');
          expect(isCovered(row)).toBe(false);
          const f = finger(row);
          f.down(10);
          f.move(20);
          f.move(35);
          f.move(35 + 96);
          caughtUp();
          expect(isCovered(row)).toBe(true);
          expect(isHidden(other)).toBe(true);
          f.up({afterMs: 0});
          // The slide-out, the fire and the way home keep the cover.
          await act(async () => {
            vi.advanceTimersByTime(100);
          });
          expect(isHidden(other)).toBe(true);
          await act(async () => {
            vi.advanceTimersByTime(400);
          });
          expect(outer).toHaveBeenCalledTimes(1);
          expect(isHidden(other)).toBe(true);
          await settled();
          expect(xOf(row)).toBe(0);
          expect(isCovered(row)).toBe(false);
          expect(isHidden(other)).toBe(false);
        });

        it('keeps a tapped entry with hasRemoval over the panel while the row slides and holds out, through a stray touch', async () => {
          const unread = vi.fn();
          const {row} = renderRow({
            leading: [
              {label: 'Unread', onActivate: unread, hasRemoval: true},
              {label: 'Pin', onActivate: vi.fn()},
            ],
          });
          openRow(row);
          const [, pin] = entriesOf(row, 'leading');
          fireEvent.click(screen.getByRole('button', {name: 'Unread'}));
          await act(async () => {});
          expect(isCovered(row)).toBe(true);
          expect(isHidden(pin)).toBe(true);
          // A finger that lands and lifts while the row slides out starts no
          // swipe, and the cover stays.
          const stray = finger(row, 2);
          stray.down(150);
          stray.up();
          expect(isHidden(pin)).toBe(true);
          await settled();
          expect(unread).toHaveBeenCalledTimes(1);
          expect(xOf(row)).toBeGreaterThan(300);
          expect(isHidden(pin)).toBe(true);
          // The same on the held-out row, before the caller removes it.
          const later = finger(row, 3);
          later.down(150);
          later.up();
          expect(isHidden(pin)).toBe(true);
        });

        it('keeps a tapped entry over the panel while the row returns, when firing changes its label', async () => {
          function Toggling() {
            const [isRead, setIsRead] = useState(false);
            return (
              <Item
                label="Conversation"
                data-testid="row"
                swipe={createSwipe({
                  leading: [
                    {
                      label: isRead ? 'Unread' : 'Read',
                      onActivate: () => setIsRead(read => !read),
                    },
                    {label: 'Pin', onActivate: vi.fn()},
                  ],
                })}
              />
            );
          }
          render(<Toggling />);
          const row = screen.getByTestId('row');
          layOut(row);
          openRow(row);
          fireEvent.click(screen.getByRole('button', {name: 'Read'}));
          await act(async () => {});
          // The row returns with Unread, the same entry, over the panel: not
          // a bare surface.
          const [toggled, pin] = entriesOf(row, 'leading');
          expect(toggled).toHaveTextContent('Unread');
          expect(isCovered(row)).toBe(true);
          expect(isHidden(toggled)).toBe(false);
          expect(isHidden(pin)).toBe(true);
          await settled();
          expect(xOf(row)).toBe(0);
          expect(isCovered(row)).toBe(false);
        });
      });

      it('closes a swipe that confirmed and backed out, even at rest past half the panel, and fires nothing', async () => {
        const onActivate = vi.fn();
        const {row} = renderRow({leading: [{label: 'Unread', onActivate}]});
        const f = finger(row);
        f.down(10);
        f.move(20);
        f.move(35);
        f.move(35 + 230);
        f.move(35 + 150);
        f.rest();
        f.up();
        await settled();
        expect(xOf(row)).toBe(0);
        expect(onActivate).not.toHaveBeenCalled();
      });

      it('fires from a confirmed release whatever its velocity, even moving back', async () => {
        const onActivate = vi.fn();
        const {row} = renderRow({leading: [{label: 'Unread', onActivate}]});
        const f = finger(row);
        f.down(10);
        f.move(20);
        f.move(35);
        f.move(35 + 150);
        f.move(35 + 260);
        // Coming back fast, still past the confirm point when it lifts.
        f.move(35 + 240);
        f.move(35 + 222);
        f.up({afterMs: 0});
        await settled();
        expect(onActivate).toHaveBeenCalledTimes(1);
      });

      it('never confirms toward a disabled outermost entry', async () => {
        const onActivate = vi.fn();
        const {row} = renderRow({
          leading: [{label: 'Unread', onActivate, isDisabled: true}],
        });
        const f = finger(row);
        f.down(10);
        f.move(20);
        f.move(35);
        f.move(35 + 260);
        caughtUp();
        // No run ahead: the row stays on the finger, unconfirmed.
        expect(xOf(row)).toBe(260);
        expect(confirmOf(row)).toBe(0);
        f.rest();
        f.up();
        await settled();
        expect(onActivate).not.toHaveBeenCalled();
        // A slow release past half the panel rests open.
        expect(xOf(row)).toBe(72);
      });

      it("fires the outermost entry once the row's content has left its box, long before the slide-out comes to rest", async () => {
        const outer = vi.fn();
        const {row} = renderRow({
          leading: [
            {label: 'Unread', onActivate: vi.fn()},
            {label: 'Pin', onActivate: outer},
          ],
        });
        // Confirmed from the open row: the confirm point is 231.6 px for the
        // 144 px panel on the 300 px row. The row runs ahead to 271 px, inside
        // its box, and nothing has fired yet.
        openRow(row);
        dragLeading(row, 106);
        expect(outer).not.toHaveBeenCalled();
        // UIKit calls the handler at the lift. The row fires once its content
        // has left its box (300 px), a fraction of a second into the slide-out.
        // The slide-out's tail toward 324 px lasts most of a second.
        await act(async () => {
          vi.advanceTimersByTime(450);
        });
        expect(outer).toHaveBeenCalledTimes(1);
      });

      it("fires on the next frame when the release is already past the row's edge", () => {
        const outer = vi.fn();
        const {row} = renderRow({
          leading: [
            {label: 'Unread', onActivate: vi.fn()},
            {label: 'Pin', onActivate: outer},
          ],
        });
        openRow(row);
        const f = finger(row);
        f.down(10);
        f.move(20);
        f.move(35);
        f.move(35 + 16);
        f.move(35 + 186);
        f.rest(1200);
        expect(xOf(row)).toBeGreaterThan(300);
        f.up({afterMs: 0});
        expect(outer).not.toHaveBeenCalled();
        act(() => {
          vi.advanceTimersByTime(16);
        });
        expect(outer).toHaveBeenCalledTimes(1);
      });

      it("drops a slide-out's fire when the row leaves before passing its edge, after a second slide-out replaced the first", async () => {
        const outer = vi.fn();
        const {row, unmount} = renderRow({
          leading: [
            {label: 'Unread', onActivate: vi.fn()},
            {label: 'Pin', onActivate: outer},
          ],
        });
        // Confirmed past about 232 px from the open row: out it goes.
        openRow(row);
        dragLeading(row, 96);
        await act(async () => {});
        // A finger catches the sliding row before it passes its edge, backs it
        // out of the full swipe, and confirms it again. The first slide-out is
        // replaced and fires nothing.
        const f = finger(row, 2);
        f.down(150);
        f.move(140);
        f.move(110);
        f.move(80);
        f.move(20);
        caughtUp();
        expect(xOf(row)).toBeLessThan(232);
        expect(outer).not.toHaveBeenCalled();
        // Past the confirm point again, short of the run-ahead's 271 px.
        f.move(120);
        caughtUp();
        expect(xOf(row)).toBe(271);
        f.up({afterMs: 0});
        // The row leaves before the second slide-out carries it past its
        // edge.
        unmount();
        await act(async () => {
          vi.advanceTimersByTime(3000);
        });
        expect(outer).not.toHaveBeenCalled();
      });

      it("a disabled outermost entry's fill beside it takes the disabled entry's look", () => {
        const {row} = renderRow({
          trailing: [
            {label: 'Archive', onActivate: vi.fn()},
            {
              label: 'Delete',
              onActivate: vi.fn(),
              variant: 'destructive',
              isDisabled: true,
            },
          ],
        });
        // The disabled entry is its colour at half strength, and so is the fill
        // painted beside it (its own pseudo-element, under the entry's filter).
        // It never shows the full colour of a verb that cannot fire. Its
        // opacity stays free for the cover. A disabled outermost entry never
        // confirms, so the track's cover fill never shows.
        const [, outer] = entriesOf(row, 'trailing');
        const rules = rulesDeclaredFor(outer);
        expect(rules.some(r => /filter: opacity\(0?\.5\)/.test(r))).toBe(true);
        expect(
          rules.some(
            r =>
              r.includes('::after') && r.includes('background-color: inherit'),
          ),
        ).toBe(true);
      });
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
      const leading = trackOf(row, 'leading');
      const trailing = trackOf(row, 'trailing');
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
      // The outermost entry is the last one, at the outer end. Its colour is
      // painted beside it out to the outer edge (a pseudo-element, no element),
      // so a slide-out fills the row with it. At rest, the track's cover fill
      // wears the outermost entry's colour, hidden until an entry covers the
      // panel.
      const [archiveEntry, deleteEntry] = entriesOf(row, 'trailing');
      expect(deleteEntry).toHaveTextContent('Delete');
      const outerFill = (entry: HTMLElement) =>
        rulesDeclaredFor(entry).some(
          r => r.includes('::after') && r.includes('background-color: inherit'),
        );
      expect(outerFill(deleteEntry)).toBe(true);
      expect(outerFill(archiveEntry)).toBe(false);
      expect(
        rulesDeclaredFor(trailing).some(
          r =>
            r.includes('::before') &&
            r.includes('background-color: var(--color-error'),
        ),
      ).toBe(true);
    });
  });

  describe('commit', () => {
    it('slides out and fires on a confirmed full swipe; nothing rests', async () => {
      const onActivate = vi.fn();
      const {row} = renderRow({
        behavior: 'commit',
        leading: [{label: 'Unread', onActivate}],
      });
      const panel = panelOf(row, 'leading') as HTMLElement;
      // Presentational at all times: nothing in it is ever tappable.
      expect(panel).toHaveAttribute('aria-hidden', 'true');
      expect(panel.querySelector('button')).toBeNull();
      // One entry: a 72 px panel; the full swipe confirms at about 209 px.
      dragLeading(row, 220);
      await act(async () => {
        vi.advanceTimersByTime(100);
      });
      expect(xOf(row)).toBeGreaterThan(220);
      await settled();
      expect(onActivate).toHaveBeenCalledTimes(1);
      await settled();
      expect(xOf(row)).toBe(0);
      expect(panel).toHaveAttribute('aria-hidden', 'true');
    });

    it('springs back from any release short of the commit point, even past the panel', async () => {
      const onActivate = vi.fn();
      const {row} = renderRow({
        behavior: 'commit',
        leading: [{label: 'Unread', onActivate}],
      });
      dragLeading(row, 100);
      await settled();
      expect(onActivate).not.toHaveBeenCalled();
      expect(xOf(row)).toBe(0);
    });

    it('never fires on a flick short of the commit point', async () => {
      const onActivate = vi.fn();
      const {row} = renderRow({
        behavior: 'commit',
        leading: [{label: 'Unread', onActivate}],
      });
      const f = finger(row);
      f.down(10);
      f.move(25);
      f.move(40);
      f.move(60);
      f.move(80);
      f.up({afterMs: 0});
      await settled();
      expect(onActivate).not.toHaveBeenCalled();
      expect(xOf(row)).toBe(0);
    });

    it('holds out after a committed entry with hasRemoval', async () => {
      const onActivate = vi.fn();
      const {row} = renderRow({
        behavior: 'commit',
        leading: [{label: 'Archive', onActivate, hasRemoval: true}],
      });
      dragLeading(row, 220);
      await settled();
      expect(onActivate).toHaveBeenCalledTimes(1);
      await settled();
      expect(xOf(row)).toBe(324);
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
          expect.stringContaining("swipeBehavior: 'commit'"),
        );
      } finally {
        warn.mockRestore();
      }
    });
  });

  it('gives the root back its own styles when the swipe actions go', () => {
    const actions = {leading: [{label: 'Unread', onActivate: vi.fn()}]};
    const {rerender} = render(
      <Item
        label="Conversation"
        onClick={vi.fn()}
        data-testid="row"
        swipe={createSwipe(actions)}
      />,
    );
    const row = screen.getByTestId('row');
    layOut(row);
    const f = finger(row);
    f.down(10);
    f.move(20);
    f.move(35);
    f.move(65);
    caughtUp();
    expect(xOf(row)).toBe(30);
    f.up();
    rerender(<Item label="Conversation" onClick={vi.fn()} data-testid="row" />);
    expect(screen.getByTestId('row')).toBe(row);
    expect(row.style.getPropertyValue('--_item-swipe-travel')).toBe('');
  });

  it('frees the press of a row that loses its swipe while open', async () => {
    const {rerender} = render(
      <Item
        label="Open"
        onClick={vi.fn()}
        data-testid="open"
        swipe={createSwipe({leading: [{label: 'Unread', onActivate: vi.fn()}]})}
      />,
    );
    const open = screen.getByTestId('open');
    layOut(open);
    dragLeading(open, 45);
    await settled();
    expect(xOf(open)).toBe(72);
    expect(open).toHaveAttribute('data-astryx-press-held');
    rerender(<Item label="Open" onClick={vi.fn()} data-testid="open" />);
    expect(screen.getByTestId('open')).toBe(open);
    expect(open).not.toHaveAttribute('data-astryx-press-held');
    expect(open).toHaveAttribute('data-astryx-pressable');
  });

  it('reads the direction logically under RTL: leading is toward the inline end', async () => {
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
            swipe={createSwipe({
              leading: [{label: 'Unread', onActivate}],
            })}
          />
        </div>,
      );
      const row = screen.getByTestId('row');
      layOut(row);
      // Toward the inline end is leftward: the finger moves to smaller x.
      const f = finger(row);
      f.down(200);
      f.move(190);
      f.move(175);
      f.move(155);
      f.move(135);
      caughtUp();
      // Physical travel is negative, and the panel parts mirror it. The side's
      // pin is on the right, and the open width runs in from the row's right
      // edge.
      expect(xOf(row)).toBe(-40);
      expect(
        panelOf(row, 'leading')?.style.getPropertyValue('--_item-swipe-pin'),
      ).toBe('-72px');
      f.rest();
      f.up();
      await settled();
      expect(xOf(row)).toBe(-72);
      // Rightward from a closed row is toward the inline start: no trailing
      // entries, so it is not claimed.
      fireEvent.pointerDown(document.body, {
        pointerId: 9,
        pointerType: 'touch',
      });
      await settled();
      expect(xOf(row)).toBe(0);
      const g = finger(row);
      g.down(10);
      g.move(40);
      expect(g.move(70).defaultPrevented).toBe(false);
      expect(xOf(row)).toBe(0);
      g.up();
    } finally {
      spy.mockRestore();
    }
  });

  it('swipes nothing for a value not made by createSwipe (spec:AST-057 FR1)', () => {
    const forged = {
      leading: [{label: 'Unread', onActivate: vi.fn()}],
    } as unknown as Swipe;
    render(<Item label="A" data-testid="row" swipe={forged} />);
    const row = screen.getByTestId('row');
    expect(panelOf(row, 'leading')).toBeNull();
    expect(row.childElementCount).toBe(1);
  });

  describe('a new value from an inline createSwipe call (spec:AST-057 FR11)', () => {
    function InlineRow({entries}: {entries: Entry[]}) {
      return (
        <Item
          label="Conversation"
          onClick={vi.fn()}
          data-testid="row"
          swipe={createSwipe({leading: entries})}
        />
      );
    }

    it('keeps a closed row closed and an open row open, and fires the newest handler', async () => {
      const first = vi.fn();
      const second = vi.fn();
      const {rerender} = render(
        <InlineRow entries={[{label: 'Unread', onActivate: first}]} />,
      );
      const row = screen.getByTestId('row');
      layOut(row);
      rerender(<InlineRow entries={[{label: 'Unread', onActivate: first}]} />);
      expect(xOf(row)).toBe(0);
      dragLeading(row, 45);
      await settled();
      expect(xOf(row)).toBe(72);
      rerender(<InlineRow entries={[{label: 'Unread', onActivate: second}]} />);
      await settled();
      expect(xOf(row)).toBe(72);
      expect(panelOf(row, 'leading')).not.toHaveAttribute('inert');
      fireEvent.click(screen.getByRole('button', {name: 'Unread'}));
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);
    });

    it('keeps a row settling open open through a new value', async () => {
      const onActivate = vi.fn();
      const {rerender} = render(
        <InlineRow entries={[{label: 'Unread', onActivate: vi.fn()}]} />,
      );
      const row = screen.getByTestId('row');
      layOut(row);
      dragLeading(row, 45);
      // Settling open from the release, which already counts as open (the
      // settle itself is Item.sharedDrag.test.tsx's: jsdom has no animations).
      expect(panelOf(row, 'leading')).not.toHaveAttribute('inert');
      rerender(<InlineRow entries={[{label: 'Unread', onActivate}]} />);
      expect(panelOf(row, 'leading')).not.toHaveAttribute('inert');
      await settled();
      expect(xOf(row)).toBe(72);
      fireEvent.click(screen.getByRole('button', {name: 'Unread'}));
      expect(onActivate).toHaveBeenCalledTimes(1);
    });

    it('repaints a changed entry list on an open row', async () => {
      const {rerender} = render(
        <InlineRow entries={[{label: 'Unread', onActivate: vi.fn()}]} />,
      );
      const row = screen.getByTestId('row');
      layOut(row);
      dragLeading(row, 45);
      await settled();
      expect(xOf(row)).toBe(72);
      const onActivate = vi.fn();
      rerender(<InlineRow entries={[{label: 'Read', onActivate}]} />);
      expect(screen.queryByRole('button', {name: 'Unread'})).toBeNull();
      fireEvent.click(screen.getByRole('button', {name: 'Read'}));
      expect(onActivate).toHaveBeenCalledTimes(1);
    });
  });

  describe('the deprecated swipeActions and swipeBehavior (spec:AST-057 DEP-0017)', () => {
    // The deprecated path's loader brings their layer with `import()`. Load it
    // once, so each row below renders its layer at once, as it does in an app
    // once the chunk has arrived.
    beforeAll(async () => {
      render(
        <Item
          label="Warm"
          data-testid="warm"
          swipeActions={{leading: [{label: 'Unread', onActivate: () => {}}]}}
        />,
      );
      await swipeLayerLoaded();
      expect(
        screen.getByTestId('warm').querySelector('[data-swipe-panel]'),
      ).not.toBeNull();
      cleanup();
    });

    function renderDeprecatedRow({
      leading = [{label: 'Unread', onActivate: vi.fn()}],
      behavior,
    }: {leading?: Entry[]; behavior?: 'reveal' | 'commit'} = {}) {
      render(
        <Item
          label="Conversation"
          onClick={vi.fn()}
          data-testid="row"
          swipeActions={{leading}}
          swipeBehavior={behavior}
        />,
      );
      const row = screen.getByTestId('row');
      layOut(row);
      return {row};
    }

    it('still rest a row open and fire a tapped entry, as released', async () => {
      const onActivate = vi.fn();
      const {row} = renderDeprecatedRow({
        leading: [{label: 'Unread', onActivate}],
      });
      dragLeading(row, 45);
      await settled();
      expect(xOf(row)).toBe(72);
      fireEvent.click(screen.getByRole('button', {name: 'Unread'}));
      expect(onActivate).toHaveBeenCalledTimes(1);
      await settled();
      expect(xOf(row)).toBe(0);
    });

    it('still slide a row out and fire on a confirmed full swipe under commit', async () => {
      const onActivate = vi.fn();
      const {row} = renderDeprecatedRow({
        behavior: 'commit',
        leading: [{label: 'Unread', onActivate}],
      });
      expect(panelOf(row, 'leading')).toHaveAttribute('aria-hidden', 'true');
      dragLeading(row, 220);
      await settled();
      expect(onActivate).toHaveBeenCalledTimes(1);
      await settled();
      expect(xOf(row)).toBe(0);
    });

    it('give the root the style a row given swipe has', () => {
      const leading = [{label: 'Unread', onActivate: vi.fn()}];
      render(
        <>
          <Item label="A" data-testid="deprecated" swipeActions={{leading}} />
          <Item
            label="A"
            data-testid="current"
            swipe={createSwipe({leading})}
          />
        </>,
      );
      expect(screen.getByTestId('deprecated').className).toBe(
        screen.getByTestId('current').className,
      );
    });

    it('keep the released role gate: a listitem is served, an option is not', async () => {
      const actions = {leading: [{label: 'Unread', onActivate: vi.fn()}]};
      const {rerender} = render(
        <Item as="li" label="A" data-testid="row" swipeActions={actions} />,
      );
      await act(async () => {});
      expect(panelOf(screen.getByTestId('row'), 'leading')).not.toBeNull();
      rerender(
        <Item
          role="option"
          label="A"
          data-testid="row"
          swipeActions={actions}
        />,
      );
      await act(async () => {});
      expect(panelOf(screen.getByTestId('row'), 'leading')).toBeNull();
    });

    it('give way to swipe, and a development note names the props it ignores', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const ignored = vi.fn();
        render(
          <Item
            label="A"
            data-testid="row"
            swipe={createSwipe({
              trailing: [{label: 'Archive', onActivate: vi.fn()}],
            })}
            swipeActions={{leading: [{label: 'Unread', onActivate: ignored}]}}
            swipeBehavior="commit"
          />,
        );
        const row = screen.getByTestId('row');
        expect(panelOf(row, 'trailing')).not.toBeNull();
        expect(panelOf(row, 'leading')).toBeNull();
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining(
            '`swipe` is set, so the deprecated `swipeActions` and `swipeBehavior` are ignored.',
          ),
        );
      } finally {
        warn.mockRestore();
      }
    });

    it('warn nothing at run time on their own (spec:AST-017 FR29)', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        renderDeprecatedRow();
        expect(warn).not.toHaveBeenCalled();
      } finally {
        warn.mockRestore();
      }
    });

    it('keep the released warning for a committing side with more than one entry', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        renderDeprecatedRow({
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
});

// A slot is empty for exactly the values React renders as nothing.
describe('Item empty slots', () => {
  it.each([
    ['an empty string', ''],
    ['false', false],
    ['true', true],
    ['null', null],
  ])('renders no start or end wrapper for %s', (_name, value) => {
    const {container: withSlots} = render(
      <Item
        label="Item"
        startContent={value as ReactNode}
        endContent={value as ReactNode}
      />,
    );
    const {container: without} = render(<Item label="Item" />);
    expect(withSlots.innerHTML).toBe(without.innerHTML);
  });

  it.each([
    ['false', false],
    ['true', true],
    ['null', null],
  ])('renders no description wrapper for %s', (_name, description) => {
    const {container: withDescription} = render(
      <Item label="Item" description={description as ReactNode} />,
    );
    const {container: without} = render(<Item label="Item" />);
    expect(withDescription.innerHTML).toBe(without.innerHTML);
  });

  it.each([
    ['an empty string', ''],
    ['false', false],
  ])(
    'keeps the stacked layout for an inline row whose description is %s',
    (_name, description) => {
      const {container: withDescription} = render(
        <Item
          label="Item"
          layout="inline"
          description={description as ReactNode}
        />,
      );
      const {container: without} = render(
        <Item label="Item" layout="inline" />,
      );
      expect(withDescription.innerHTML).toBe(without.innerHTML);
    },
  );

  it('renders no description element for an empty string', () => {
    render(<Item label="Item" description="" />);
    const label = screen.getByText('Item');
    expect(label.parentElement?.children).toHaveLength(1);
  });

  it('renders 0 in the start, end and description slots, as React does', () => {
    render(
      <Item label="Item" startContent={0} endContent={0} description={0} />,
    );
    expect(screen.getAllByText('0')).toHaveLength(3);
  });
});
