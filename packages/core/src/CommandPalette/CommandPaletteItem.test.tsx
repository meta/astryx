// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CommandPaletteItem.test.tsx
 * @input Uses vitest, @testing-library/react
 * @output Unit tests for CommandPaletteItem
 */

import {createRef, type ReactElement} from 'react';
import {afterEach, describe, it, expect, vi} from 'vitest';
import {render, screen, fireEvent, waitFor} from '@testing-library/react';
import {Dialog} from '../Dialog/Dialog';
import {CommandPaletteContext} from './CommandPaletteContext';
import type {CommandPaletteContextValue} from './CommandPaletteContext';
import {CommandPaletteItem} from './CommandPaletteItem';

const scrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'scrollIntoView',
);

function mockScrollIntoView() {
  const scrollIntoView = vi.fn();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: scrollIntoView,
  });
  return scrollIntoView;
}

afterEach(() => {
  if (scrollIntoViewDescriptor) {
    Object.defineProperty(
      HTMLElement.prototype,
      'scrollIntoView',
      scrollIntoViewDescriptor,
    );
  } else {
    delete (HTMLElement.prototype as unknown as {scrollIntoView?: unknown})
      .scrollIntoView;
  }
});

function makeContext(
  overrides: Partial<CommandPaletteContextValue> = {},
): CommandPaletteContextValue {
  return {
    search: '',
    setSearch: vi.fn(),
    value: '',
    setValue: vi.fn(),
    listId: 'command-list',
    highlightedIndex: -1,
    setHighlightedIndex: vi.fn(),
    getItemId: index => `command-item-${index}`,
    selectableItems: [{value: 'test', label: 'Item'}],
    searchResults: [],
    selectItem: vi.fn(),
    onKeyDown: vi.fn(),
    onClose: vi.fn(),
    isOpen: true,
    isBusy: false,
    ...overrides,
  };
}

function renderWithContext(
  item: ReactElement,
  overrides: Partial<CommandPaletteContextValue> = {},
) {
  const context = makeContext(overrides);
  return {
    context,
    ...render(
      <CommandPaletteContext value={context}>{item}</CommandPaletteContext>,
    ),
  };
}

describe('CommandPaletteItem', () => {
  it('renders children', () => {
    render(<CommandPaletteItem value="test">Test Item</CommandPaletteItem>);
    expect(screen.getByText('Test Item')).toBeInTheDocument();
  });

  it('has option role', () => {
    render(<CommandPaletteItem value="test">Item</CommandPaletteItem>);
    expect(screen.getByRole('option')).toBeInTheDocument();
  });

  it('carries the stable item theme target', () => {
    render(<CommandPaletteItem value="test">Item</CommandPaletteItem>);
    expect(screen.getByRole('option')).toHaveClass(
      'astryx-command-palette-item',
    );
  });

  it('calls onSelect when clicked', () => {
    const handleSelect = vi.fn();
    render(
      <CommandPaletteItem value="test" onSelect={handleSelect}>
        Item
      </CommandPaletteItem>,
    );
    fireEvent.click(screen.getByRole('option'));
    expect(handleSelect).toHaveBeenCalledWith('test');
  });

  it('coordinates selection and close through CommandPalette context', () => {
    const handleSelect = vi.fn();
    const {context} = renderWithContext(
      <CommandPaletteItem value="test" onSelect={handleSelect}>
        Item
      </CommandPaletteItem>,
    );

    fireEvent.click(screen.getByRole('option'));

    expect(handleSelect).toHaveBeenCalledWith('test');
    expect(context.selectItem).toHaveBeenCalledWith('test');
    expect(context.onClose).toHaveBeenCalledTimes(1);
  });

  it('lets consumer click cancellation stop contextual selection and close', () => {
    const {context} = renderWithContext(
      <CommandPaletteItem
        value="test"
        onClick={event => event.preventDefault()}>
        Item
      </CommandPaletteItem>,
    );

    fireEvent.click(screen.getByRole('option'));

    expect(context.selectItem).not.toHaveBeenCalled();
    expect(context.onClose).not.toHaveBeenCalled();
  });

  it('does not call onSelect when disabled', () => {
    const handleSelect = vi.fn();
    render(
      <CommandPaletteItem value="test" onSelect={handleSelect} isDisabled>
        Item
      </CommandPaletteItem>,
    );
    fireEvent.click(screen.getByRole('option'));
    expect(handleSelect).not.toHaveBeenCalled();
  });

  it('does not call consumer click or selection handlers when disabled', () => {
    const handleClick = vi.fn();
    const handleSelect = vi.fn();
    render(
      <CommandPaletteItem
        value="test"
        isDisabled
        onClick={handleClick}
        onSelect={handleSelect}>
        Item
      </CommandPaletteItem>,
    );

    fireEvent.click(screen.getByRole('option'));

    expect(handleClick).not.toHaveBeenCalled();
    expect(handleSelect).not.toHaveBeenCalled();
  });

  it('lets a consumer cancel selection from onClick', () => {
    const handleSelect = vi.fn();
    render(
      <CommandPaletteItem
        value="test"
        onClick={event => event.preventDefault()}
        onSelect={handleSelect}>
        Item
      </CommandPaletteItem>,
    );

    fireEvent.click(screen.getByRole('option'));

    expect(handleSelect).not.toHaveBeenCalled();
  });

  it('derives selected state and item identity from context', () => {
    renderWithContext(
      <CommandPaletteItem value="test" id="consumer-id">
        Item
      </CommandPaletteItem>,
      {value: 'test'},
    );

    const item = screen.getByRole('option');
    expect(item).toHaveAttribute('id', 'command-item-0');
    expect(item).toHaveAttribute('aria-selected', 'true');
  });

  it('lets explicit visual state override context-derived state', () => {
    renderWithContext(
      <CommandPaletteItem value="test" isHighlighted={false} isSelected={false}>
        Item
      </CommandPaletteItem>,
      {value: 'test', highlightedIndex: 0},
    );

    const item = screen.getByRole('option');
    expect(item).toHaveAttribute('aria-selected', 'false');
    expect(item).not.toHaveAttribute('data-selected');
    expect(item).not.toHaveAttribute('data-highlighted');
  });

  it('protects owned option semantics from native passthrough props', () => {
    render(
      <CommandPaletteItem
        value="test"
        role="button"
        aria-selected={true}
        aria-disabled={true}>
        Item
      </CommandPaletteItem>,
    );

    const item = screen.getByRole('option');
    expect(item).toHaveAttribute('aria-selected', 'false');
    expect(item).not.toHaveAttribute('aria-disabled');
  });

  it('sets aria-disabled when disabled', () => {
    render(
      <CommandPaletteItem value="test" isDisabled>
        Item
      </CommandPaletteItem>,
    );
    expect(screen.getByRole('option')).toHaveAttribute('aria-disabled', 'true');
  });

  it('sets aria-selected when selected (not highlighted)', () => {
    render(
      <CommandPaletteItem value="test" isSelected>
        Item
      </CommandPaletteItem>,
    );
    expect(screen.getByRole('option')).toHaveAttribute('aria-selected', 'true');
  });

  it('does not set aria-selected when only highlighted', () => {
    // Highlight is visual only — aria-activedescendant on the input conveys
    // keyboard focus, so aria-selected must not be set on highlight alone.
    render(
      <CommandPaletteItem value="test" isHighlighted>
        Item
      </CommandPaletteItem>,
    );
    expect(screen.getByRole('option')).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('scrolls highlighted items into view by default', async () => {
    const scrollIntoView = mockScrollIntoView();

    render(
      <CommandPaletteItem value="test" isHighlighted>
        Item
      </CommandPaletteItem>,
    );

    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalledWith({block: 'nearest'});
    });
  });

  it('does not scroll initially highlighted items in inline dialogs', () => {
    const scrollIntoView = mockScrollIntoView();

    render(
      <Dialog isOpen isInline onOpenChange={() => {}}>
        <CommandPaletteItem value="test" isHighlighted>
          Item
        </CommandPaletteItem>
      </Dialog>,
    );

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('scrolls inline dialog items after highlight changes', async () => {
    const scrollIntoView = mockScrollIntoView();

    const {rerender} = render(
      <Dialog isOpen isInline onOpenChange={() => {}}>
        <CommandPaletteItem value="test" isHighlighted={false}>
          Item
        </CommandPaletteItem>
      </Dialog>,
    );

    rerender(
      <Dialog isOpen isInline onOpenChange={() => {}}>
        <CommandPaletteItem value="test" isHighlighted>
          Item
        </CommandPaletteItem>
      </Dialog>,
    );

    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalledWith({block: 'nearest'});
    });
  });

  it('forwards ref and standalone DOM attributes to the option', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <CommandPaletteItem
        ref={ref}
        value="test"
        id="standalone-item"
        aria-label="Open settings"
        data-kind="command">
        Item
      </CommandPaletteItem>,
    );

    const item = screen.getByRole('option', {name: 'Open settings'});
    expect(ref.current).toBe(item);
    expect(item).toHaveAttribute('id', 'standalone-item');
    expect(item).toHaveAttribute('data-kind', 'command');
  });

  it('carries the stable theme target and consumer styling on its root', () => {
    render(
      <CommandPaletteItem
        value="test"
        className="consumer-item"
        style={{marginBlockStart: '8px'}}>
        Item
      </CommandPaletteItem>,
    );

    const item = screen.getByRole('option');
    expect(item).toHaveClass('astryx-command-palette-item');
    expect(item).toHaveClass('consumer-item');
    expect(item).toHaveStyle({marginBlockStart: '8px'});
  });

  it('reflects selected and disabled state on its theme target', () => {
    render(
      <>
        <CommandPaletteItem value="rest">Rest</CommandPaletteItem>
        <CommandPaletteItem value="selected" isSelected>
          Selected
        </CommandPaletteItem>
        <CommandPaletteItem value="disabled" isDisabled>
          Disabled
        </CommandPaletteItem>
      </>,
    );

    const rest = screen.getByRole('option', {name: 'Rest'});
    expect(rest).not.toHaveAttribute('data-selected');
    expect(rest).not.toHaveAttribute('data-disabled');
    expect(screen.getByRole('option', {name: 'Selected'})).toHaveAttribute(
      'data-selected',
      'selected',
    );
    expect(screen.getByRole('option', {name: 'Disabled'})).toHaveAttribute(
      'data-disabled',
      'disabled',
    );
  });

  it('reflects context-derived selection on its theme target', () => {
    renderWithContext(
      <CommandPaletteItem value="test">Item</CommandPaletteItem>,
      {value: 'test'},
    );

    expect(screen.getByRole('option')).toHaveAttribute(
      'data-selected',
      'selected',
    );
  });

  it('reflects explicit and context-derived highlight on its theme target', () => {
    renderWithContext(
      <>
        <CommandPaletteItem value="test">
          Context highlighted
        </CommandPaletteItem>
        <CommandPaletteItem value="other" isHighlighted>
          Explicitly highlighted
        </CommandPaletteItem>
        <CommandPaletteItem value="rest">Rest</CommandPaletteItem>
      </>,
      {highlightedIndex: 0},
    );

    expect(
      screen.getByRole('option', {name: 'Context highlighted'}),
    ).toHaveAttribute('data-highlighted', 'highlighted');
    expect(
      screen.getByRole('option', {name: 'Explicitly highlighted'}),
    ).toHaveAttribute('data-highlighted', 'highlighted');
    expect(screen.getByRole('option', {name: 'Rest'})).not.toHaveAttribute(
      'data-highlighted',
    );
  });

  it('sets data-value attribute', () => {
    render(<CommandPaletteItem value="my-value">Item</CommandPaletteItem>);
    expect(screen.getByRole('option')).toHaveAttribute(
      'data-value',
      'my-value',
    );
  });
});
