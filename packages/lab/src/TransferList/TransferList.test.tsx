// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TransferList.test.tsx
 * @input Uses Vitest, Testing Library, and the data-driven TransferList API
 * @output Behavioral coverage for immediate transfers, filtering, and
 *   reordering through core List's reorder handles, with keys here. The touch
 *   and mouse drags in a real browser are in the a11y Chromium specs
 * @position Lab tests; validates TransferList.tsx
 *
 * SYNC: When TransferList.tsx behavior changes, update these tests.
 */

import {Suspense, startTransition, use, useMemo, useState} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import userEvent from '@testing-library/user-event';
import * as stylex from '@stylexjs/stylex';
import {createReorderable} from '@astryxdesign/core';
import {
  TransferList,
  type TransferListOption,
  type TransferListProps,
} from './TransferList';

const OPTIONS: ReadonlyArray<TransferListOption<string>> = [
  {
    value: 'name',
    label: 'Name',
    description: 'Primary identifier',
    group: 'Identity',
  },
  {value: 'owner', label: 'Owner', group: 'Identity'},
  {value: 'status', label: 'Status', group: 'Details'},
  {value: 'updated', label: 'Updated', group: 'Details'},
];

const LOCKED_OPTIONS: ReadonlyArray<TransferListOption<string>> = [
  OPTIONS[0],
  {
    value: 'owner',
    label: 'Owner',
    group: 'Identity',
    isTransferDisabled: true,
    disabledMessage: 'Owner is required and fixed in position.',
  },
  OPTIONS[2],
  OPTIONS[3],
];

const TRANSFER_LOCKED_OPTIONS: ReadonlyArray<TransferListOption<string>> = [
  OPTIONS[0],
  {
    value: 'owner',
    label: 'Owner',
    group: 'Identity',
    isTransferDisabled: true,
    disabledMessage: 'Owner is required.',
  },
  OPTIONS[2],
  OPTIONS[3],
];

/** Moves `key` to index `to` of `value`: how an owner applies a move. */
function moveValue(
  value: readonly string[],
  key: string,
  to: number,
): readonly string[] {
  const next = value.filter(item => item !== key);
  next.splice(to, 0, key);
  return next;
}

type ControlledTransferListProps = Omit<
  TransferListProps<string>,
  'label' | 'options' | 'value' | 'onChange'
> & {
  initialValue?: readonly string[];
  onValueChange?: (value: readonly string[]) => void;
  options?: ReadonlyArray<TransferListOption<string>>;
  /**
   * Values that keep their place: the helper's reorderable object rejects
   * them in `isReorderable`. Its `onReorder` applies each move to its value.
   */
  fixed?: readonly string[];
  /** Pass no reorderable object, so the selected options keep their order. */
  isUnordered?: boolean;
};

function ControlledTransferList({
  initialValue = [],
  onValueChange,
  options = OPTIONS,
  fixed,
  isUnordered = false,
  ...props
}: ControlledTransferListProps) {
  const [value, setValue] = useState<readonly string[]>(initialValue);
  const reorderable = useMemo(
    () =>
      isUnordered
        ? undefined
        : createReorderable<string>({
            onReorder: ({key, to}) =>
              setValue(current => {
                const next = moveValue(current, key, to);
                onValueChange?.(next);
                return next;
              }),
            isReorderable:
              fixed == null ? undefined : key => !fixed.includes(key),
          }),
    [fixed, isUnordered, onValueChange],
  );

  return (
    <TransferList
      label="Columns"
      selectedLabel="Selected columns"
      availableLabel="Available columns"
      options={options}
      value={value}
      onChange={nextValue => {
        onValueChange?.(nextValue);
        setValue(nextValue);
      }}
      {...(reorderable == null ? null : {reorderable})}
      {...props}
    />
  );
}

const FIXED_OWNER: readonly string[] = ['owner'];

const testStyles = stylex.create({
  root: (opacity: number) => ({opacity}),
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TransferList', () => {
  it('disables every control while keeping them focusable, without option-specific messages', () => {
    const onChange = vi.fn();
    render(
      <TransferList
        label="Columns"
        options={LOCKED_OPTIONS}
        value={['name', 'owner']}
        onChange={onChange}
        hasSearch
        isDisabled
      />,
    );
    const remove = screen.getByRole('button', {name: 'Remove Name'});
    expect(remove).toHaveAttribute('aria-disabled', 'true');
    expect(remove).not.toHaveAttribute('disabled');
    remove.focus();
    expect(remove).toHaveFocus();
    fireEvent.click(remove);
    expect(onChange).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', {name: 'Remove Owner'}),
    ).not.toHaveAccessibleDescription(
      'Owner is required and fixed in position.',
    );
    expect(screen.getByRole('searchbox')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  describe('semantics and content', () => {
    it('renders a labelled pair of semantic lists without listbox roles', () => {
      render(
        <TransferList
          label="Table columns"
          description="Choose and order the columns shown in the table."
          selectedLabel="Shown columns"
          availableLabel="Hidden columns"
          options={OPTIONS}
          value={['name', 'status']}
          onChange={() => {}}
        />,
      );

      expect(screen.getByText('Table columns')).toBeInTheDocument();
      expect(
        screen.getByText('Choose and order the columns shown in the table.'),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('list', {name: 'Shown columns'}),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('list', {name: 'Hidden columns'}),
      ).toBeInTheDocument();
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(screen.queryByRole('option')).not.toBeInTheDocument();
    });

    it('uses one divided collection with direction-neutral row actions', () => {
      const {container} = render(
        <ControlledTransferList
          initialValue={['name', 'status']}
          hasClear
          hasSelectAll
        />,
      );

      const collection = container.querySelector(
        '.astryx-transfer-list-collection',
      );
      expect(collection).toBeInTheDocument();
      expect(
        collection?.querySelectorAll(':scope > .astryx-transfer-list-panel'),
      ).toHaveLength(2);

      expect(screen.queryByText('2 items')).not.toBeInTheDocument();
      expect(screen.getByRole('button', {name: 'Clear'})).toHaveAttribute(
        'data-transfer-list-header-action',
        'true',
      );
      expect(screen.getByRole('button', {name: 'Add all'})).toHaveAttribute(
        'data-transfer-list-header-action',
        'true',
      );
      const addButton = screen.getByRole('button', {name: 'Add Owner'});
      const removeButton = screen.getByRole('button', {name: 'Remove Name'});
      // Glyphs render through the shared Icon primitive rather than a raw
      // inline <svg>: the add glyph is an icon component (astryx-icon on the
      // svg) and remove reuses the registry `close` glyph (astryx-icon on its
      // wrapping span). Assert the icon primitive is present and a glyph drew.
      expect(addButton.querySelector('.astryx-icon')).toBeInTheDocument();
      expect(addButton.querySelector('svg')).toBeInTheDocument();
      expect(removeButton.querySelector('.astryx-icon')).toBeInTheDocument();
      expect(removeButton.querySelector('svg')).toBeInTheDocument();

      const selectedList = screen.getByRole('list', {
        name: 'Selected columns',
      });
      const nameRow = within(selectedList).getByText('Name').closest('li');
      expect(nameRow).not.toBeNull();
      const rowButtons = within(nameRow as HTMLLIElement).getAllByRole(
        'button',
      );
      // The row's action, then List's reorder handle at the row's end.
      expect(rowButtons[0]).toHaveAccessibleName('Remove Name');
      expect(rowButtons[1]).toHaveAccessibleName('Reorder Name');
      expect(rowButtons[1]).toHaveAttribute('data-astryx-list-reorder');
    });

    it('keeps support metadata out of rows while retaining search and groups', async () => {
      const user = userEvent.setup();
      render(
        <ControlledTransferList initialValue={['name', 'status']} hasSearch />,
      );

      expect(screen.queryByText('Primary identifier')).not.toBeInTheDocument();
      expect(screen.getAllByText('Identity').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Details').length).toBeGreaterThan(0);

      await user.type(screen.getByRole('searchbox'), 'primary identifier');
      expect(screen.getByText('Name')).toBeInTheDocument();
      expect(screen.queryByText('Owner')).not.toBeInTheDocument();
    });

    it('renders custom option content for selected and available values', () => {
      render(
        <ControlledTransferList
          initialValue={['name']}
          renderOption={option => (
            <span data-testid={`custom-${option.value}`}>
              Custom {option.label}
            </span>
          )}
        />,
      );

      expect(screen.getByTestId('custom-name')).toHaveTextContent(
        'Custom Name',
      );
      expect(screen.getByTestId('custom-status')).toHaveTextContent(
        'Custom Status',
      );
      // The handle is named after the row's text, not its place.
      expect(
        screen.getByRole('button', {name: 'Reorder Custom Name'}),
      ).toBeInTheDocument();
    });

    it('names a reorder handle after its option when renderOption returns a component (spec:AST-103 FR4)', async () => {
      function OptionLabel({label}: {label: string}) {
        return <span>{label}</span>;
      }
      render(
        <ControlledTransferList
          initialValue={['name', 'status']}
          renderOption={option => <OptionLabel label={option.label} />}
        />,
      );
      expect(
        await screen.findByRole('button', {name: 'Reorder Name'}),
      ).toBeInTheDocument();
      expect(
        await screen.findByRole('button', {name: 'Reorder Status'}),
      ).toBeInTheDocument();
    });

    it('renders custom empty-state copy for both panels', () => {
      const {rerender} = render(
        <TransferList
          label="Columns"
          options={OPTIONS}
          value={[]}
          onChange={() => {}}
          selectedEmptyText="Nothing is shown"
          availableEmptyText="Nothing else is available"
        />,
      );

      expect(screen.getByText('Nothing is shown')).toBeInTheDocument();

      rerender(
        <TransferList
          label="Columns"
          options={OPTIONS}
          value={OPTIONS.map(option => option.value)}
          onChange={() => {}}
          selectedEmptyText="Nothing is shown"
          availableEmptyText="Nothing else is available"
        />,
      );
      expect(screen.getByText('Nothing else is available')).toBeInTheDocument();
    });
  });

  describe('transfers and filtering', () => {
    it('adds to the committed value when React discards a render', async () => {
      // A transition that suspends for good: React renders the new props, then
      // keeps the committed tree and never commits that render.
      const pending = new Promise<never>(() => {});
      function Pending(): null {
        use(pending);
        return null;
      }
      const onChange = vi.fn();
      function Screen({
        value,
        isPending,
      }: {
        value: readonly string[];
        isPending: boolean;
      }) {
        return (
          <Suspense fallback={null}>
            <TransferList
              label="Columns"
              selectedLabel="Selected columns"
              availableLabel="Available columns"
              options={OPTIONS}
              value={value}
              onChange={onChange}
            />
            {isPending ? <Pending /> : null}
          </Suspense>
        );
      }
      const {rerender} = render(<Screen value={['name']} isPending={false} />);
      await act(async () => {
        startTransition(() => {
          rerender(<Screen value={['name', 'status']} isPending />);
        });
      });
      fireEvent.click(screen.getByRole('button', {name: 'Add Owner'}));
      expect(onChange).toHaveBeenLastCalledWith(['name', 'owner']);
    });

    it('appends an added value and preserves selected order when removing', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      render(
        <ControlledTransferList
          initialValue={['status', 'name']}
          onValueChange={onValueChange}
        />,
      );

      await user.click(screen.getByRole('button', {name: 'Add Owner'}));
      expect(onValueChange).toHaveBeenLastCalledWith([
        'status',
        'name',
        'owner',
      ]);

      await user.click(screen.getByRole('button', {name: 'Remove Name'}));
      expect(onValueChange).toHaveBeenLastCalledWith(['status', 'owner']);
    });

    it('filters both panels with the shared search field', async () => {
      const user = userEvent.setup();
      render(
        <ControlledTransferList
          initialValue={['name', 'status']}
          hasSearch
          searchLabel="Filter columns"
          searchPlaceholder="Find a column"
          noResultsText="No matching columns"
        />,
      );

      const search = screen.getByRole('searchbox', {name: 'Filter columns'});
      expect(search).toHaveAttribute('placeholder', 'Find a column');

      await user.type(search, 'owner');
      expect(screen.getByText('Owner')).toBeInTheDocument();
      expect(screen.queryByText('Updated')).not.toBeInTheDocument();
      expect(screen.getAllByText('No matching columns').length).toBeGreaterThan(
        0,
      );
    });

    it('disables search by default, and shows a reorder handle with reorderable', () => {
      render(<ControlledTransferList initialValue={['name']} />);

      expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', {name: 'Reorder Name'}),
      ).toBeInTheDocument();
    });

    it('can turn on search and turn off reordering', () => {
      render(
        <ControlledTransferList
          initialValue={['name']}
          hasSearch
          isUnordered
        />,
      );

      expect(screen.getByRole('searchbox')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', {name: 'Reorder Name'}),
      ).not.toBeInTheDocument();
    });
  });

  describe('option constraints and bulk actions', () => {
    it('keeps locked controls visible and disabled', () => {
      render(
        <ControlledTransferList
          options={LOCKED_OPTIONS}
          fixed={['owner']}
          initialValue={['owner', 'status']}
        />,
      );

      expect(
        screen.getByRole('button', {name: 'Remove Owner'}),
      ).toHaveAttribute('aria-disabled', 'true');
      // A row that keeps its place has no handle.
      expect(screen.queryByRole('button', {name: 'Reorder Owner'})).toBeNull();
      expect(
        screen.getByRole('button', {name: 'Reorder Status'}),
      ).toBeInTheDocument();
    });

    it('applies transfer and reorder constraints independently', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      const constrainedOptions = [
        {
          ...OPTIONS[1],
          isTransferDisabled: true,
          disabledMessage: 'Owner is required.',
        },
        OPTIONS[2],
      ];
      render(
        <ControlledTransferList
          options={constrainedOptions}
          fixed={['status']}
          initialValue={['owner', 'status']}
          onValueChange={onValueChange}
        />,
      );

      expect(
        screen.getByRole('button', {name: 'Remove Owner'}),
      ).toHaveAttribute('aria-disabled', 'true');
      expect(
        screen.getByRole('button', {name: 'Reorder Owner'}),
      ).not.toHaveAttribute('aria-disabled');
      expect(
        screen.getByRole('button', {name: 'Remove Status'}),
      ).not.toHaveAttribute('aria-disabled');
      expect(screen.queryByRole('button', {name: 'Reorder Status'})).toBeNull();

      await user.click(screen.getByRole('button', {name: 'Remove Status'}));
      expect(onValueChange).toHaveBeenCalledWith(['owner']);
    });

    it('adds all transfer-enabled available values in option order', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      render(
        <ControlledTransferList
          options={TRANSFER_LOCKED_OPTIONS}
          initialValue={['status']}
          hasSelectAll
          onValueChange={onValueChange}
        />,
      );

      await user.click(screen.getByRole('button', {name: 'Add all'}));
      expect(onValueChange).toHaveBeenCalledWith(['status', 'name', 'updated']);
    });

    it('clears removable values but retains transfer-disabled values', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      render(
        <ControlledTransferList
          options={TRANSFER_LOCKED_OPTIONS}
          initialValue={['status', 'owner', 'updated']}
          hasClear
          onValueChange={onValueChange}
        />,
      );

      await user.click(screen.getByRole('button', {name: 'Clear'}));
      expect(onValueChange).toHaveBeenCalledWith(['owner']);
    });
  });

  describe('root customization', () => {
    it('provides a theme target and forwards root props and ref', () => {
      const ref = {current: null as HTMLDivElement | null};
      const onClick = vi.fn();
      render(
        <TransferList
          ref={ref}
          label="Columns"
          options={OPTIONS}
          value={['name']}
          onChange={() => {}}
          data-testid="transfer-list"
          data-owner="tables"
          className="consumer-class"
          style={{marginTop: 12}}
          xstyle={testStyles.root(0.75)}
          onClick={onClick}
        />,
      );

      const root = screen.getByTestId('transfer-list');
      expect(ref.current).toBe(root);
      expect(root).toHaveClass('astryx-transfer-list', 'consumer-class');
      expect(root).toHaveAttribute('data-owner', 'tables');
      expect(root).toHaveStyle({marginTop: '12px'});
      expect(root.getAttribute('style')).toContain('0.75');
      root.click();
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('transfer updates', () => {
    it('commits individual and bulk changes immediately', () => {
      const onValueChange = vi.fn();
      render(
        <ControlledTransferList
          initialValue={['name']}
          hasClear
          hasSelectAll
          onValueChange={onValueChange}
        />,
      );

      fireEvent.click(screen.getByRole('button', {name: 'Add Owner'}));

      expect(onValueChange).toHaveBeenLastCalledWith(['name', 'owner']);
      expect(
        within(screen.getByRole('list', {name: 'Selected columns'})).getByText(
          'Owner',
        ),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', {name: 'Remove Owner'}));
      expect(onValueChange).toHaveBeenLastCalledWith(['name']);

      fireEvent.click(screen.getByRole('button', {name: 'Add all'}));
      expect(onValueChange).toHaveBeenLastCalledWith([
        'name',
        'owner',
        'status',
        'updated',
      ]);

      fireEvent.click(screen.getByRole('button', {name: 'Clear'}));
      expect(onValueChange).toHaveBeenLastCalledWith([]);
    });
  });

  describe('reordering through List', () => {
    it("reports each move to an owner's reorderable object in value terms, never through onChange", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      const onReorder = vi.fn();
      const reorderable = createReorderable<string>({
        onReorder,
        isReorderable: key => key !== 'owner',
      });
      // `legacy` has no option: it keeps a place in the value, unshown.
      render(
        <TransferList
          label="Columns"
          options={OPTIONS}
          value={['name', 'legacy', 'status', 'owner']}
          onChange={onChange}
          reorderable={reorderable}
        />,
      );
      expect(screen.queryByRole('button', {name: 'Reorder Owner'})).toBeNull();
      screen.getByRole('button', {name: 'Reorder Name'}).focus();
      await user.keyboard('{Enter}{ArrowDown}{Escape}');
      // Name now follows Status: index 2 of the value, `legacy` counted.
      expect(onReorder).toHaveBeenCalledOnce();
      expect(onReorder).toHaveBeenCalledWith({key: 'name', to: 2});
      expect(onChange).not.toHaveBeenCalled();
    });

    it("applies an owner object's moves the way it reports them, a value without an option keeping its place among the hidden", async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      render(
        <ControlledTransferList
          fixed={[]}
          initialValue={['legacy', 'name', 'status', 'updated']}
          onValueChange={onValueChange}
        />,
      );
      screen.getByRole('button', {name: 'Reorder Updated'}).focus();
      await user.keyboard('{Enter}{ArrowUp}{ArrowUp}{Escape}');
      expect(onValueChange).toHaveBeenLastCalledWith([
        'legacy',
        'updated',
        'name',
        'status',
      ]);
    });

    it('takes no change from a drag that drops after the list became disabled', () => {
      const onValueChange = vi.fn();
      const {rerender} = render(
        <ControlledTransferList
          initialValue={['name', 'owner', 'status']}
          onValueChange={onValueChange}
        />,
      );
      const handle = screen.getByRole('button', {name: 'Reorder Name'});
      const list = handle.closest('ul');
      if (list == null) {
        throw new Error('no selected list');
      }
      // jsdom lays nothing out: 44 px rows from 300 px down the viewport.
      const place = (row: Element) => Array.from(list.children).indexOf(row);
      for (const row of Array.from(list.children)) {
        Object.defineProperty(row, 'offsetParent', {
          configurable: true,
          get: () => list,
        });
        Object.defineProperty(row, 'offsetTop', {
          configurable: true,
          get: () => place(row) * 44,
        });
        Object.defineProperty(row, 'offsetHeight', {
          configurable: true,
          value: 44,
        });
        row.getBoundingClientRect = () =>
          DOMRect.fromRect({
            x: 0,
            y: 300 + place(row) * 44,
            width: 300,
            height: 44,
          });
      }
      const mouse = {
        pointerType: 'mouse',
        pointerId: 1,
        button: 0,
        clientX: 280,
      };
      fireEvent.pointerDown(handle, {...mouse, clientY: 322});
      fireEvent.pointerMove(handle, {...mouse, clientY: 330});
      fireEvent.pointerMove(handle, {...mouse, clientY: 392});

      rerender(
        <ControlledTransferList
          initialValue={['name', 'owner', 'status']}
          onValueChange={onValueChange}
          isDisabled
        />,
      );
      act(() => {
        fireEvent.pointerUp(list, {...mouse, clientY: 392});
      });
      expect(onValueChange).not.toHaveBeenCalled();
    });

    it('gives each selected row a List reorder handle and none to available rows', () => {
      render(<ControlledTransferList initialValue={['name', 'status']} />);
      const selected = screen.getByRole('list', {name: 'Selected columns'});
      const available = screen.getByRole('list', {name: 'Available columns'});
      expect(
        within(selected).getAllByRole('button', {name: /^Reorder /}),
      ).toHaveLength(2);
      expect(
        within(available).queryAllByRole('button', {name: /^Reorder /}),
      ).toHaveLength(0);
      expect(
        selected.querySelectorAll('[data-astryx-list-reorder]'),
      ).toHaveLength(2);
    });

    it('turns reordering off while a search filters the panel', async () => {
      const user = userEvent.setup();
      render(
        <ControlledTransferList
          initialValue={['name', 'owner', 'status']}
          hasSearch
        />,
      );
      expect(screen.getByRole('button', {name: 'Reorder Name'})).toBeVisible();
      await user.type(screen.getByRole('searchbox'), 'n');
      expect(screen.queryByRole('button', {name: 'Reorder Name'})).toBeNull();
      await user.clear(screen.getByRole('searchbox'));
      expect(screen.getByRole('button', {name: 'Reorder Name'})).toBeVisible();
    });

    it('reports each move so the owner keeps the shown rows in the order the list shows, around a value without an option', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      render(
        <ControlledTransferList
          initialValue={['name', 'retired', 'owner', 'status']}
          onValueChange={onValueChange}
        />,
      );
      // The rows the list shows: every value with an option, in value order.
      const shown = () =>
        (onValueChange.mock.lastCall?.[0] as readonly string[]).filter(
          value => value !== 'retired',
        );
      screen.getByRole('button', {name: 'Reorder Owner'}).focus();
      await user.keyboard(' {ArrowDown}');
      expect(shown()).toEqual(['name', 'status', 'owner']);
      await user.keyboard('{ArrowUp}{ArrowUp}{Escape}');
      expect(shown()).toEqual(['owner', 'name', 'status']);
      // The value without an option stays in the value, wherever the owner
      // places it.
      expect(onValueChange.mock.lastCall?.[0]).toContain('retired');
      screen.getByRole('button', {name: 'Reorder Name'}).focus();
      await user.keyboard(' {ArrowDown}{Escape}');
      expect(shown()).toEqual(['owner', 'status', 'name']);
    });
  });

  describe('keyboard reordering', () => {
    it.each([
      ['Enter', '{Enter}'],
      ['Space', ' '],
    ])(
      'turns on reorder mode with %s: each arrow changes the value once, keeping handle focus',
      async (_, press) => {
        const user = userEvent.setup();
        const onValueChange = vi.fn();
        render(
          <ControlledTransferList
            initialValue={['name', 'owner', 'status']}
            onValueChange={onValueChange}
          />,
        );

        const handle = screen.getByRole('button', {name: 'Reorder Owner'});
        handle.focus();
        await user.keyboard(press);
        expect(handle).toHaveAttribute('aria-pressed', 'true');
        await user.keyboard('{ArrowUp}');
        expect(onValueChange).toHaveBeenCalledTimes(1);
        expect(onValueChange).toHaveBeenLastCalledWith([
          'owner',
          'name',
          'status',
        ]);
        expect(handle).toHaveFocus();
      },
    );

    it('changes the value once per move', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      render(
        <ControlledTransferList
          initialValue={['name', 'owner', 'status', 'updated']}
          onValueChange={onValueChange}
        />,
      );

      const handle = screen.getByRole('button', {name: 'Reorder Owner'});
      handle.focus();
      await user.keyboard(' {ArrowDown}{ArrowDown}');

      expect(onValueChange).toHaveBeenNthCalledWith(1, [
        'name',
        'status',
        'owner',
        'updated',
      ]);
      expect(onValueChange).toHaveBeenNthCalledWith(2, [
        'name',
        'status',
        'updated',
        'owner',
      ]);
      expect(onValueChange).toHaveBeenCalledTimes(2);
      expect(handle).toHaveFocus();
    });

    it('keeps the moves when Escape ends reorder mode', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      render(
        <ControlledTransferList
          initialValue={['name', 'owner', 'status']}
          onValueChange={onValueChange}
        />,
      );

      const handle = screen.getByRole('button', {name: 'Reorder Owner'});
      handle.focus();
      await user.keyboard('{Enter}{ArrowDown}{Escape}');

      expect(handle).toHaveAttribute('aria-pressed', 'false');
      expect(onValueChange).toHaveBeenCalledTimes(1);
      expect(onValueChange).toHaveBeenLastCalledWith([
        'name',
        'status',
        'owner',
      ]);
      expect(handle).toHaveFocus();
    });

    it('ends a grab without any change when the list becomes disabled mid-reorder', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      const {rerender} = render(
        <ControlledTransferList
          initialValue={['name', 'owner', 'status']}
          onValueChange={onValueChange}
        />,
      );

      const handle = screen.getByRole('button', {name: 'Reorder Owner'});
      handle.focus();
      await user.keyboard('{Enter}{ArrowDown}');
      expect(onValueChange).toHaveBeenCalledTimes(1);

      rerender(
        <ControlledTransferList
          initialValue={['name', 'owner', 'status']}
          onValueChange={onValueChange}
          isDisabled
        />,
      );
      expect(handle).toHaveAttribute('aria-pressed', 'false');
      await user.keyboard('{Escape}');
      expect(onValueChange).toHaveBeenCalledTimes(1);
    });

    it('keeps a focused handle focused, in the tab order and disabled when the list becomes disabled', async () => {
      const {rerender} = render(
        <ControlledTransferList initialValue={['name', 'owner', 'status']} />,
      );
      const handle = screen.getByRole('button', {name: 'Reorder Owner'});
      handle.focus();

      rerender(
        <ControlledTransferList
          initialValue={['name', 'owner', 'status']}
          isDisabled
        />,
      );
      expect(handle).toHaveFocus();
      expect(handle.tabIndex).toBe(0);
      expect(handle).not.toHaveAttribute('disabled');
      for (const each of screen.getAllByRole('button', {name: /^Reorder /})) {
        expect(each).toHaveAttribute('aria-disabled', 'true');
      }
      // The handle's description says why the row does not move.
      await waitFor(() =>
        expect(handle).toHaveAccessibleDescription(/Owner cannot be reordered/),
      );
    });

    it('describes the reorder handle, not a toggle that renderOption puts in the row, when the list is disabled', async () => {
      render(
        <ControlledTransferList
          initialValue={['name', 'owner', 'status']}
          isDisabled
          renderOption={option => (
            <span>
              {option.label}
              <button type="button" aria-pressed="false">
                {`Pin ${option.label}`}
              </button>
            </span>
          )}
        />,
      );
      const handle = screen.getByRole('button', {name: /^Reorder Owner/});
      await waitFor(() =>
        expect(handle).toHaveAccessibleDescription(/Owner cannot be reordered/),
      );
      expect(
        screen.getByRole('button', {name: 'Pin Owner'}),
      ).not.toHaveAccessibleDescription(/cannot be reordered/);
    });

    it('keeps values from passing a reorder-disabled value at an end, and lets them pass one in the middle', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      const {unmount} = render(
        <ControlledTransferList
          fixed={FIXED_OWNER}
          initialValue={['owner', 'name', 'status', 'updated']}
          onValueChange={onValueChange}
        />,
      );

      // Owner leads the list: nothing goes before it.
      const name = screen.getByRole('button', {name: 'Reorder Name'});
      name.focus();
      await user.keyboard('{Enter}{ArrowUp}{Escape}');
      expect(onValueChange).not.toHaveBeenCalled();

      const updated = screen.getByRole('button', {name: 'Reorder Updated'});
      updated.focus();
      await user.keyboard('{Enter}{ArrowUp}{ArrowUp}{ArrowUp}{Escape}');
      expect(onValueChange).toHaveBeenCalledTimes(2);
      expect(onValueChange).toHaveBeenLastCalledWith([
        'owner',
        'updated',
        'name',
        'status',
      ]);
      expect(updated).toHaveFocus();
      unmount();

      // In the middle, Owner is passed like any other row.
      onValueChange.mockClear();
      render(
        <ControlledTransferList
          fixed={FIXED_OWNER}
          initialValue={['name', 'owner', 'status', 'updated']}
          onValueChange={onValueChange}
        />,
      );
      screen.getByRole('button', {name: 'Reorder Name'}).focus();
      await user.keyboard('{Enter}{ArrowDown}{Escape}');
      expect(onValueChange).toHaveBeenLastCalledWith([
        'owner',
        'name',
        'status',
        'updated',
      ]);
    });
  });
});

describe("the owner's reorderable object", () => {
  it("its start(key) turns on reorder mode for that row in TransferList's list (spec:AST-103 FR4a)", () => {
    let start: ((key: string) => void) | undefined;
    function Owned() {
      const [value, setValue] = useState<readonly string[]>(['name', 'status']);
      const reorderable = useMemo(
        () =>
          createReorderable<string>({
            onReorder: ({key, to}) =>
              setValue(current => moveValue(current, key, to)),
          }),
        [],
      );
      start = key => reorderable.start(key);
      return (
        <TransferList
          label="Columns"
          selectedLabel="Selected columns"
          availableLabel="Available columns"
          options={OPTIONS}
          value={value}
          onChange={setValue}
          reorderable={reorderable}
        />
      );
    }
    render(<Owned />);
    const handle = screen.getByRole('button', {name: 'Reorder Status'});
    expect(handle).not.toHaveAttribute('aria-pressed', 'true');
    act(() => start?.('status'));
    expect(handle).toHaveAttribute('aria-pressed', 'true');
  });

  it('loads no reorder code of its own: the engine comes with the owner\u2019s object (spec:AST-103 FR2)', () => {
    for (const file of ['TransferList.tsx', 'TransferListSelector.tsx']) {
      const source = fs.readFileSync(
        path.join(import.meta.dirname, file),
        'utf8',
      );
      const valueImports = [
        ...source.matchAll(
          /^import\s+(?!type\b)\{([^}]*)\}\s+from\s+'([^']+)';/gm,
        ),
      ];
      for (const [, names, from] of valueImports) {
        const values = names
          .split(',')
          .map(name => name.trim())
          .filter(name => name !== '' && !name.startsWith('type '));
        expect(values, `${file}: ${from}`).not.toContain('createReorderable');
      }
    }
  });

  it('reflects a kept row as reorder fixed on its own target, apart from its transfer state (theming-surface INV6)', () => {
    const {container} = render(
      <ControlledTransferList
        initialValue={['name', 'status']}
        fixed={['name']}
      />,
    );
    const rowOf = (value: string) =>
      container.querySelector<HTMLElement>(
        `[data-transfer-list-row="${value}"]`,
      );
    expect(rowOf('name')).toHaveAttribute('data-reorder', 'fixed');
    expect(rowOf('name')).toHaveAttribute('data-state', 'enabled');
    expect(rowOf('status')).toHaveAttribute('data-reorder', 'movable');
  });
});
