// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file BaseTypeahead.optionActions.test.tsx
 * @input BaseTypeahead, Typeahead and Tokenizer with results that carry an
 *   `action`
 * @output The panel's listbox and grid roles, the two-cell rows, keys, pointer
 *   presses and names for a result's secondary control
 * @position Colocated verification for the typeahead panel's option actions
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {useState} from 'react';
import {BaseTypeahead} from './BaseTypeahead';
import {Typeahead} from './Typeahead';
import {Tokenizer} from '../Tokenizer/Tokenizer';
import type {SearchSource, SearchableItem} from './types';

const popoverOpenState = new WeakMap<HTMLElement, boolean>();
const originalMatchesDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'matches',
);
const originalMatches = HTMLElement.prototype.matches;

beforeAll(() => {
  HTMLElement.prototype.showPopover = function () {
    popoverOpenState.set(this, true);
    const event = new Event('toggle');
    Object.defineProperty(event, 'newState', {value: 'open'});
    this.dispatchEvent(event);
  };
  HTMLElement.prototype.hidePopover = function () {
    popoverOpenState.set(this, false);
    const event = new Event('toggle');
    Object.defineProperty(event, 'newState', {value: 'closed'});
    this.dispatchEvent(event);
  };
  Object.defineProperty(HTMLElement.prototype, 'matches', {
    ...originalMatchesDescriptor,
    value(this: HTMLElement, selector: string) {
      if (selector === ':popover-open') {
        return popoverOpenState.get(this) ?? false;
      }
      return originalMatches.call(this, selector);
    },
  });
});

afterAll(() => {
  if (originalMatchesDescriptor) {
    Object.defineProperty(
      HTMLElement.prototype,
      'matches',
      originalMatchesDescriptor,
    );
  }
});

function pinButton(label: string, onPin: (label: string) => void) {
  return (
    <button
      type="button"
      aria-label={`Pin ${label}`}
      onClick={() => onPin(label)}>
      Pin
    </button>
  );
}

function officeSource(
  onPin: (label: string) => void,
  {withActions = true}: {withActions?: boolean} = {},
): SearchSource<SearchableItem> {
  const offices = ['Boston', 'London', 'Toronto'];
  return {
    search: query =>
      offices
        .filter(label => label.toLowerCase().includes(query.toLowerCase()))
        .map(label => ({
          id: label.toLowerCase(),
          label,
          action:
            withActions && label !== 'Toronto'
              ? pinButton(label, onPin)
              : undefined,
        })),
    bootstrap: () => [],
  };
}

function Field({
  source,
  onChange,
  dir,
}: {
  source: SearchSource<SearchableItem>;
  onChange?: (item: SearchableItem | null) => void;
  dir?: 'rtl';
}) {
  const [value, setValue] = useState<SearchableItem | null>(null);
  return (
    <BaseTypeahead
      aria-label="Office"
      searchSource={source}
      value={value}
      onChange={item => {
        setValue(item);
        onChange?.(item);
      }}
      debounceMs={0}
      style={dir === 'rtl' ? {direction: 'rtl'} : undefined}
    />
  );
}

async function openFor(query: string) {
  const user = userEvent.setup();
  const input = screen.getByRole('combobox');
  await user.type(input, query);
  return {user, input};
}

function activeElementOf(input: HTMLElement) {
  return document.getElementById(
    input.getAttribute('aria-activedescendant') ?? '',
  );
}

describe('BaseTypeahead option actions', () => {
  describe('roles', () => {
    it('stays a listbox when no result carries an action', async () => {
      render(<Field source={officeSource(() => {}, {withActions: false})} />);
      const {input} = await openFor('o');
      expect(await screen.findByRole('listbox', {hidden: true})).toBeTruthy();
      expect(screen.queryByRole('grid', {hidden: true})).toBeNull();
      expect(input).not.toHaveAttribute('aria-haspopup');
      expect(
        screen.getAllByRole('option', {hidden: true}).length,
      ).toBeGreaterThan(0);
    });

    it('is a grid of two-cell rows once a result carries an action, and says so on the input', async () => {
      render(<Field source={officeSource(() => {})} />);
      const {input} = await openFor('o');
      const grid = await screen.findByRole('grid', {hidden: true});
      expect(input).toHaveAttribute('aria-haspopup', 'grid');
      expect(
        within(grid).queryAllByRole('option', {hidden: true}),
      ).toHaveLength(0);
      const rows = within(grid).getAllByRole('row', {hidden: true});
      expect(rows.map(row => row.textContent)).toEqual([
        'BostonPin',
        'LondonPin',
        'Toronto',
      ]);
      for (const row of rows) {
        // Exactly two cells, the second empty for a result with no action.
        expect(
          within(row).getAllByRole('gridcell', {hidden: true}),
        ).toHaveLength(2);
      }
      const [optionCell, actionCell] = within(rows[2]).getAllByRole(
        'gridcell',
        {hidden: true},
      );
      expect(optionCell).toHaveTextContent('Toronto');
      expect(actionCell).toBeEmptyDOMElement();
    });

    it('names each row by its option cell, never by the control', async () => {
      render(<Field source={officeSource(() => {})} />);
      await openFor('o');
      const [row] = await screen.findAllByRole('row', {hidden: true});
      const [optionCell] = within(row).getAllByRole('gridcell', {hidden: true});
      expect(row).toHaveAttribute('aria-labelledby', optionCell.id);
      expect(optionCell).toHaveTextContent('Boston');
      expect(optionCell).not.toContainElement(
        within(row).getByRole('button', {hidden: true}),
      );
    });

    it('stays a grid when a later list carries no action', async () => {
      render(<Field source={officeSource(() => {})} />);
      const {user, input} = await openFor('o');
      await screen.findByRole('grid', {hidden: true});
      // Only Toronto, which has no action, matches now.
      await user.clear(input);
      await user.type(input, 'tor');
      await waitFor(() => {
        expect(screen.getAllByRole('row', {hidden: true})).toHaveLength(1);
      });
      expect(screen.getByRole('grid', {hidden: true})).toBeTruthy();
      expect(input).toHaveAttribute('aria-haspopup', 'grid');
    });

    it('makes a section a rowgroup in a grid', async () => {
      const source: SearchSource<SearchableItem> = {
        search: () => [
          {
            id: 'london',
            label: 'London',
            auxiliaryData: {group: 'Pinned'},
            action: pinButton('London', () => {}),
          },
          {id: 'boston', label: 'Boston'},
        ],
        bootstrap: () => [],
      };
      render(<Field source={source} />);
      await openFor('o');
      const grid = await screen.findByRole('grid', {hidden: true});
      expect(within(grid).queryByRole('group', {hidden: true})).toBeNull();
      expect(
        within(grid).getByRole('rowgroup', {name: 'Pinned', hidden: true}),
      ).toBeTruthy();
    });

    it('keeps the "nothing matched" message out of the listbox options', async () => {
      const source: SearchSource<SearchableItem> = {
        search: () => [],
        bootstrap: () => [],
      };
      render(<Field source={source} />);
      await openFor('zz');
      const listbox = await screen.findByRole('listbox', {hidden: true});
      await waitFor(() => {
        expect(listbox).toHaveTextContent(/./);
      });
      expect(within(listbox).queryAllByRole('option', {hidden: true})).toEqual(
        [],
      );
    });

    it('keeps the "nothing matched" message out of the grid rows', async () => {
      render(<Field source={officeSource(() => {})} />);
      const {user, input} = await openFor('o');
      const grid = await screen.findByRole('grid', {hidden: true});
      await user.clear(input);
      await user.type(input, 'zz');
      await waitFor(() => {
        expect(within(grid).queryAllByRole('row', {hidden: true})).toEqual([]);
      });
      await waitFor(() => {
        expect(grid).toHaveTextContent(/./);
      });
      // Still a grid, and the message is no row and no cell.
      expect(screen.getByRole('grid', {hidden: true})).toBe(grid);
      expect(within(grid).queryAllByRole('gridcell', {hidden: true})).toEqual(
        [],
      );
      expect(within(grid).queryAllByRole('option', {hidden: true})).toEqual([]);
    });
  });

  describe('keys', () => {
    it('moves to the action cell with the inline-end arrow, fires only the control with Enter, and moves back', async () => {
      const onPin = vi.fn();
      const onChange = vi.fn();
      render(<Field source={officeSource(onPin)} onChange={onChange} />);
      const {user, input} = await openFor('o');
      await screen.findByRole('grid', {hidden: true});

      await user.keyboard('{Home}');
      const row = activeElementOf(input);
      expect(row).toHaveAttribute('role', 'row');
      expect(row).toHaveTextContent('Boston');

      await user.keyboard('{ArrowRight}');
      const cell = activeElementOf(input);
      expect(cell).toHaveAttribute('role', 'gridcell');
      expect(cell?.id).toBe(`${row?.id}-action`);

      await user.keyboard('{Enter}');
      expect(onPin).toHaveBeenCalledWith('Boston');
      expect(onChange).not.toHaveBeenCalled();
      // The panel stays open with the highlight where it was.
      expect(input).toHaveAttribute('aria-expanded', 'true');
      expect(activeElementOf(input)).toBe(cell);

      await user.keyboard('{ArrowLeft}');
      expect(activeElementOf(input)).toBe(row);
      await user.keyboard('{Enter}');
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({id: 'boston'}),
      );
    });

    it('fires the action with Enter when the field is inside a shadow root', async () => {
      const onPin = vi.fn();
      const onChange = vi.fn();
      const host = document.createElement('div');
      document.body.appendChild(host);
      const container = document.createElement('div');
      host.attachShadow({mode: 'open'}).appendChild(container);
      try {
        render(<Field source={officeSource(onPin)} onChange={onChange} />, {
          container,
        });
        const input = container.querySelector('input')!;
        fireEvent.change(input, {target: {value: 'o'}});
        await waitFor(() => {
          expect(container.querySelector('[role="grid"]')).not.toBeNull();
        });
        fireEvent.keyDown(input, {key: 'Home'});
        fireEvent.keyDown(input, {key: 'ArrowRight'});
        expect(input.getAttribute('aria-activedescendant')).toMatch(/-action$/);
        fireEvent.keyDown(input, {key: 'Enter'});
        expect(onPin).toHaveBeenCalledWith('Boston');
        expect(onChange).not.toHaveBeenCalled();
      } finally {
        host.remove();
      }
    });

    it('follows visual direction in right-to-left', async () => {
      render(<Field source={officeSource(() => {})} dir="rtl" />);
      const {user, input} = await openFor('o');
      await screen.findByRole('grid', {hidden: true});
      await user.keyboard('{Home}');
      const row = activeElementOf(input);
      await user.keyboard('{ArrowRight}');
      expect(activeElementOf(input)).toBe(row);
      await user.keyboard('{ArrowLeft}');
      expect(activeElementOf(input)?.id).toBe(`${row?.id}-action`);
      await user.keyboard('{ArrowRight}');
      expect(activeElementOf(input)).toBe(row);
    });

    it('does not reach an empty action cell, and Up and Down land on the option cell', async () => {
      render(<Field source={officeSource(() => {})} />);
      const {user, input} = await openFor('o');
      await screen.findByRole('grid', {hidden: true});
      await user.keyboard('{End}');
      const toronto = activeElementOf(input);
      expect(toronto).toHaveTextContent('Toronto');
      await user.keyboard('{ArrowRight}');
      expect(activeElementOf(input)).toBe(toronto);

      await user.keyboard('{ArrowUp}{ArrowRight}');
      expect(activeElementOf(input)?.id).toMatch(/-action$/);
      await user.keyboard('{ArrowDown}');
      expect(activeElementOf(input)).toBe(toronto);
    });

    it('keeps the arrows on the caret until the arrow keys reach a row', async () => {
      render(<Field source={officeSource(() => {})} />);
      const {user, input} = await openFor('bo');
      await screen.findByRole('grid', {hidden: true});
      // The list highlights its first row by itself; typing continues.
      const row = activeElementOf(input);
      await user.keyboard('{ArrowLeft}');
      expect((input as HTMLInputElement).selectionStart).toBe(1);
      await user.keyboard('{ArrowRight}');
      expect((input as HTMLInputElement).selectionStart).toBe(2);
      expect(activeElementOf(input)).toBe(row);
    });

    it('puts no action control in the tab order of the input', async () => {
      render(<Field source={officeSource(() => {})} />);
      const {input} = await openFor('o');
      await screen.findByRole('grid', {hidden: true});
      expect(input).toHaveFocus();
      for (const cell of screen.getAllByRole('gridcell', {hidden: true})) {
        expect(cell).not.toHaveAttribute('tabindex');
      }
    });
  });

  describe('pointer', () => {
    it('runs only the control when its action is pressed, and selects from the option cell', async () => {
      const onPin = vi.fn();
      const onChange = vi.fn();
      render(<Field source={officeSource(onPin)} onChange={onChange} />);
      const {user, input} = await openFor('o');
      await screen.findByRole('grid', {hidden: true});

      await user.click(
        screen.getByRole('button', {name: 'Pin London', hidden: true}),
      );
      expect(onPin).toHaveBeenCalledWith('London');
      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByRole('grid', {hidden: true})).toBeTruthy();

      const [londonOption] = within(
        screen.getAllByRole('row', {hidden: true})[1],
      ).getAllByRole('gridcell', {hidden: true});
      await user.click(londonOption);
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({id: 'london'}),
      );
      expect(input).toHaveValue('');
    });
  });

  describe('names', () => {
    it('warns in development when a control has no accessible name', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const source: SearchSource<SearchableItem> = {
        search: () => [
          {
            id: 'boston',
            label: 'Boston',
            action: <button type="button" />,
          },
        ],
        bootstrap: () => [],
      };
      render(<Field source={source} />);
      await openFor('b');
      await screen.findByRole('grid', {hidden: true});
      await waitFor(() => {
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining('no accessible name'),
        );
      });
      warn.mockRestore();
    });

    it('no longer warns that the panel drops an action', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      render(<Field source={officeSource(() => {})} />);
      await openFor('o');
      await screen.findByRole('grid', {hidden: true});
      expect(warn).not.toHaveBeenCalledWith(
        expect.stringContaining('does not render'),
      );
      warn.mockRestore();
    });
  });

  describe('hosts', () => {
    it('Typeahead renders a result action through its panel', async () => {
      const onPin = vi.fn();
      function Host() {
        const [value, setValue] = useState<SearchableItem | null>(null);
        return (
          <Typeahead
            label="Office"
            searchSource={officeSource(onPin)}
            value={value}
            onChange={setValue}
            debounceMs={0}
          />
        );
      }
      render(<Host />);
      const user = userEvent.setup();
      await user.type(screen.getByRole('combobox'), 'o');
      await screen.findByRole('grid', {hidden: true});
      await user.click(
        screen.getByRole('button', {name: 'Pin Boston', hidden: true}),
      );
      expect(onPin).toHaveBeenCalledWith('Boston');
    });

    it('Tokenizer renders a result action through its panel', async () => {
      const onPin = vi.fn();
      function Host() {
        const [value, setValue] = useState<SearchableItem[]>([]);
        return (
          <Tokenizer
            label="Offices"
            searchSource={officeSource(onPin)}
            value={value}
            onChange={setValue}
            debounceMs={0}
            presentation="popover"
          />
        );
      }
      render(<Host />);
      const user = userEvent.setup();
      await user.type(screen.getByRole('combobox'), 'o');
      await screen.findByRole('grid', {hidden: true});
      await user.click(
        screen.getByRole('button', {name: 'Pin London', hidden: true}),
      );
      expect(onPin).toHaveBeenCalledWith('London');
      expect(screen.queryByRole('button', {name: /Remove London/i})).toBeNull();
    });
  });
});
