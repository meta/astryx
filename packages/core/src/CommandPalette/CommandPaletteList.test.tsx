// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CommandPaletteList.test.tsx
 * @input Uses vitest, @testing-library/react
 * @output Unit tests for CommandPaletteList
 */

import {describe, it, expect} from 'vitest';
import {createRef} from 'react';
import {render, screen} from '@testing-library/react';
import {createStaticSource} from '@astryxdesign/core/Typeahead';
import {CommandPalette} from './CommandPalette';
import {
  CommandPaletteContext,
  type CommandPaletteContextValue,
} from './CommandPaletteContext';
import {CommandPaletteList} from './CommandPaletteList';

function makeContext(
  overrides: Partial<CommandPaletteContextValue> = {},
): CommandPaletteContextValue {
  return {
    search: '',
    setSearch: () => {},
    value: '',
    setValue: () => {},
    listId: 'command-list',
    highlightedIndex: -1,
    setHighlightedIndex: () => {},
    getItemId: index => `command-item-${index}`,
    selectableItems: [],
    searchResults: [],
    selectItem: () => {},
    onKeyDown: () => {},
    onClose: () => {},
    isOpen: true,
    isBusy: false,
    ...overrides,
  };
}

describe('CommandPaletteList', () => {
  it('renders children', () => {
    render(
      <CommandPaletteList>
        <div>Item 1</div>
        <div>Item 2</div>
      </CommandPaletteList>,
    );
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('Item 2')).toBeInTheDocument();
  });

  it('has listbox role', () => {
    render(
      <CommandPaletteList>
        <div>Item</div>
      </CommandPaletteList>,
    );
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('carries the stable list theme target', () => {
    render(
      <CommandPaletteList>
        <div>Item</div>
      </CommandPaletteList>,
    );
    expect(screen.getByRole('listbox')).toHaveClass(
      'astryx-command-palette-list',
    );
  });

  it('preserves the consumer id when used standalone', () => {
    render(
      <CommandPaletteList id="custom-commands">
        <div>Item</div>
      </CommandPaletteList>,
    );

    expect(screen.getByRole('listbox')).toHaveAttribute(
      'id',
      'custom-commands',
    );
  });

  it('inside a palette, is a listbox only while it holds selectable results', () => {
    const {rerender} = render(
      <CommandPaletteContext value={makeContext()}>
        <CommandPaletteList>
          <div>No results</div>
        </CommandPaletteList>
      </CommandPaletteContext>,
    );
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByText('No results').parentElement).not.toHaveAttribute(
      'aria-label',
    );

    rerender(
      <CommandPaletteContext
        value={makeContext({
          selectableItems: [{value: 'open', label: 'Open'}],
        })}>
        <CommandPaletteList>
          <div>Open</div>
        </CommandPaletteList>
      </CommandPaletteContext>,
    );
    expect(screen.getByRole('listbox', {name: 'Commands'})).toHaveAttribute(
      'id',
      'command-list',
    );
  });

  it('has default aria-label', () => {
    render(
      <CommandPaletteList>
        <div>Item</div>
      </CommandPaletteList>,
    );
    expect(screen.getByRole('listbox')).toHaveAttribute(
      'aria-label',
      'Commands',
    );
  });

  it('supports custom label', () => {
    render(
      <CommandPaletteList label="Search results">
        <div>Item</div>
      </CommandPaletteList>,
    );
    expect(screen.getByRole('listbox')).toHaveAttribute(
      'aria-label',
      'Search results',
    );
  });

  it('is the listbox that the CommandPalette query field controls', async () => {
    render(
      <CommandPalette
        isOpen
        isInline
        onOpenChange={() => {}}
        searchSource={createStaticSource([{id: 'home', label: 'Home'}])}
      />,
    );

    const listbox = await screen.findByRole('listbox');
    expect(listbox.id).not.toBe('');
    expect(screen.getByRole('combobox')).toHaveAttribute(
      'aria-controls',
      listbox.id,
    );
  });

  it('connects ref to the listbox element', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <CommandPaletteList ref={ref}>
        <div>Item</div>
      </CommandPaletteList>,
    );

    expect(ref.current).toBe(screen.getByRole('listbox'));
  });

  it('combines consumer className and style with the list theme target', () => {
    render(
      <CommandPaletteList className="product-results" style={{minHeight: 120}}>
        <div>Item</div>
      </CommandPaletteList>,
    );

    const listbox = screen.getByRole('listbox');
    expect(listbox).toHaveClass(
      'astryx-command-palette-list',
      'product-results',
    );
    expect(listbox).toHaveStyle({minHeight: '120px'});
  });
});
