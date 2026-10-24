// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TransferListSelector.test.tsx
 * @input Uses TransferListSelector, React state, Vitest, and Testing Library
 * @output Unit coverage for immediate and staged commits, uncontrolled dismissal, synchronization, disabled states, defaults, and prop forwarding
 * @position Lab component test; validates the TransferListSelector public contract
 *
 * SYNC: When TransferListSelector.tsx behavior changes, update this test.
 */

import {Profiler, useState} from 'react';
import {afterAll, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  TransferListSelector,
  type TransferListSelectorProps,
} from './TransferListSelector';
import type {TransferListOption} from './TransferList';

type Column = 'name' | 'owner' | 'status' | 'updated';

const OPTIONS: ReadonlyArray<TransferListOption<Column>> = [
  {value: 'name', label: 'Name'},
  {value: 'owner', label: 'Owner'},
  {value: 'status', label: 'Status'},
  {value: 'updated', label: 'Updated'},
];

const hidden = {hidden: true} as const;
const originalMatches = HTMLElement.prototype.matches;

beforeEach(() => {
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    this.setAttribute('popover-open', '');
    const event = new Event('toggle');
    Object.defineProperty(event, 'newState', {value: 'open'});
    this.dispatchEvent(event);
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    this.removeAttribute('popover-open');
    const event = new Event('toggle');
    Object.defineProperty(event, 'newState', {value: 'closed'});
    this.dispatchEvent(event);
  });
  Object.defineProperty(HTMLElement.prototype, 'matches', {
    configurable: true,
    value: function (this: HTMLElement, selector: string): boolean {
      if (selector === ':popover-open') {
        return this.hasAttribute('popover-open');
      }
      return originalMatches.call(this, selector);
    },
  });
});

afterAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'matches', {
    configurable: true,
    value: originalMatches,
  });
});

type HarnessProps = {
  initialValue?: readonly Column[];
  onCommit: (value: readonly Column[]) => void;
  selectorProps?: Partial<
    Omit<
      TransferListSelectorProps<Column>,
      'label' | 'options' | 'value' | 'onChange'
    >
  >;
};

function Harness({
  initialValue = ['name', 'status'],
  onCommit,
  selectorProps,
}: HarnessProps) {
  const [value, setValue] = useState<readonly Column[]>(initialValue);

  return (
    <>
      <output data-testid="applied-value">{JSON.stringify(value)}</output>
      <TransferListSelector
        label="Visible fields"
        options={OPTIONS}
        value={value}
        onChange={nextValue => {
          onCommit(nextValue);
          setValue(nextValue);
        }}
        {...selectorProps}
      />
    </>
  );
}

async function openSelector(
  name = 'Visible fields',
): Promise<HTMLButtonElement> {
  const trigger = screen.getByRole('combobox', {
    name,
  }) as HTMLButtonElement;
  fireEvent.keyDown(trigger, {key: 'ArrowDown'});
  await waitFor(() => {
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });
  return trigger;
}

describe('TransferListSelector', () => {
  it('commits each edit immediately by default and renders no footer', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    const changeAction = vi.fn();
    render(<Harness onCommit={onCommit} selectorProps={{changeAction}} />);

    const trigger = await openSelector();
    const dialog = screen.getByRole('dialog', {
      name: 'Visible fields',
      ...hidden,
    });
    expect(
      within(dialog).queryByRole('button', {name: 'Apply', hidden: true}),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole('button', {name: 'Cancel', hidden: true}),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', {name: 'Add Owner', ...hidden}),
    );

    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith(['name', 'status', 'owner']);
    await waitFor(() => {
      expect(changeAction).toHaveBeenCalledOnce();
    });
    expect(changeAction).toHaveBeenCalledWith(['name', 'status', 'owner']);
    expect(screen.getByTestId('applied-value')).toHaveTextContent(
      '["name","status","owner"]',
    );
    expect(trigger).toHaveTextContent('3 selected');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    const popover = dialog.closest('[popover]');
    expect(popover).not.toBeNull();
    popover?.removeAttribute('popover-open');
    const dismissEvent = new Event('toggle');
    Object.defineProperty(dismissEvent, 'newState', {value: 'closed'});
    fireEvent(popover as HTMLElement, dismissEvent);
    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

    await openSelector();
    expect(
      screen.getByRole('button', {name: 'Remove Owner', ...hidden}),
    ).toBeInTheDocument();
    expect(screen.getByTestId('applied-value')).toHaveTextContent(
      '["name","status","owner"]',
    );
  });

  it('discards a staged draft whenever commit behavior changes', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const view = render(
      <TransferListSelector
        label="Visible fields"
        options={OPTIONS}
        value={['name', 'status']}
        onChange={onChange}
        commitBehavior="staged"
      />,
    );
    await openSelector();

    await user.click(
      screen.getByRole('button', {name: 'Add Owner', ...hidden}),
    );
    expect(
      screen.getByRole('button', {name: 'Remove Owner', ...hidden}),
    ).toBeInTheDocument();

    view.rerender(
      <TransferListSelector
        label="Visible fields"
        options={OPTIONS}
        value={['name', 'status']}
        onChange={onChange}
        commitBehavior="immediate"
      />,
    );
    expect(
      screen.getByRole('button', {name: 'Add Owner', ...hidden}),
    ).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    view.rerender(
      <TransferListSelector
        label="Visible fields"
        options={OPTIONS}
        value={['name', 'status']}
        onChange={onChange}
        commitBehavior="staged"
      />,
    );
    await waitFor(() => {
      expect(
        screen.getByRole('button', {name: 'Add Owner', ...hidden}),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole('button', {name: 'Remove Name', ...hidden}),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {name: 'Remove Status', ...hidden}),
    ).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps edits in a staged draft and commits a changed ordered copy once', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    const changeAction = vi.fn();
    render(
      <Harness
        onCommit={onCommit}
        selectorProps={{commitBehavior: 'staged', changeAction}}
      />,
    );

    const trigger = await openSelector();
    await user.click(
      screen.getByRole('button', {name: 'Add Owner', ...hidden}),
    );

    expect(screen.getByTestId('applied-value')).toHaveTextContent(
      '["name","status"]',
    );
    expect(trigger).toHaveTextContent('2 selected');
    expect(onCommit).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', {name: 'Apply', ...hidden}));

    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith(['name', 'status', 'owner']);
    await waitFor(() => {
      expect(changeAction).toHaveBeenCalledOnce();
    });
    expect(changeAction).toHaveBeenCalledWith(['name', 'status', 'owner']);
    expect(screen.getByTestId('applied-value')).toHaveTextContent(
      '["name","status","owner"]',
    );
    expect(trigger).toHaveTextContent('3 selected');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes unchanged Apply without calling onChange or changeAction', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const changeAction = vi.fn();
    render(
      <TransferListSelector
        label="Visible fields"
        options={OPTIONS}
        value={['name', 'status']}
        onChange={onChange}
        changeAction={changeAction}
        commitBehavior="staged"
      />,
    );

    const trigger = await openSelector();
    await user.click(screen.getByRole('button', {name: 'Apply', ...hidden}));

    expect(onChange).not.toHaveBeenCalled();
    expect(changeAction).not.toHaveBeenCalled();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('discards drafts after Cancel, Escape, and light dismiss', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(
      <Harness
        onCommit={onCommit}
        selectorProps={{commitBehavior: 'staged'}}
      />,
    );

    let trigger = await openSelector();
    await user.click(
      screen.getByRole('button', {name: 'Remove Name', ...hidden}),
    );
    await user.click(screen.getByRole('button', {name: 'Cancel', ...hidden}));
    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

    trigger = await openSelector();
    expect(
      screen.getByRole('button', {name: 'Remove Name', ...hidden}),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', {name: 'Remove Status', ...hidden}),
    );
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

    trigger = await openSelector();
    expect(
      screen.getByRole('button', {name: 'Remove Status', ...hidden}),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', {name: 'Remove Name', ...hidden}),
    );

    const popover = screen
      .getByRole('dialog', {name: 'Visible fields', ...hidden})
      .closest('[popover]');
    expect(popover).not.toBeNull();
    popover?.removeAttribute('popover-open');
    const dismissEvent = new Event('toggle');
    Object.defineProperty(dismissEvent, 'newState', {value: 'closed'});
    fireEvent(popover as HTMLElement, dismissEvent);
    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

    await openSelector();
    expect(
      screen.getByRole('button', {name: 'Remove Name', ...hidden}),
    ).toBeInTheDocument();
    expect(screen.getByTestId('applied-value')).toHaveTextContent(
      '["name","status"]',
    );
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('syncs differing applied values without clearing a dirty draft for equal arrays', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const view = render(
      <TransferListSelector
        label="Visible fields"
        options={OPTIONS}
        value={['name', 'status']}
        onChange={onChange}
        commitBehavior="staged"
      />,
    );
    await openSelector();

    await user.click(
      screen.getByRole('button', {name: 'Add Owner', ...hidden}),
    );
    expect(
      screen.getByRole('button', {name: 'Remove Owner', ...hidden}),
    ).toBeInTheDocument();

    view.rerender(
      <TransferListSelector
        label="Visible fields"
        options={OPTIONS}
        value={[...(['name', 'status'] as const)]}
        onChange={onChange}
        commitBehavior="staged"
      />,
    );
    expect(
      screen.getByRole('button', {name: 'Remove Owner', ...hidden}),
    ).toBeInTheDocument();

    view.rerender(
      <TransferListSelector
        label="Visible fields"
        options={OPTIONS}
        value={['owner', 'updated']}
        onChange={onChange}
        commitBehavior="staged"
      />,
    );
    await waitFor(() => {
      expect(
        screen.getByRole('button', {name: 'Remove Updated', ...hidden}),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole('button', {name: 'Remove Owner', ...hidden}),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {name: 'Add Name', ...hidden}),
    ).toBeInTheDocument();
  });

  it('defaults the trigger label to the applied selected count', () => {
    render(
      <TransferListSelector
        label="Visible fields"
        options={OPTIONS}
        value={['name', 'owner', 'updated']}
        onChange={() => {}}
      />,
    );

    expect(
      screen.getByRole('combobox', {name: 'Visible fields'}),
    ).toHaveTextContent('3 selected');
  });

  it('disables list controls when disabled, but never when merely busy', async () => {
    const view = render(
      <TransferListSelector
        label="Visible fields"
        options={OPTIONS}
        value={['name']}
        onChange={() => {}}
        commitBehavior="staged"
      />,
    );
    await openSelector();
    const dialog = screen.getByRole('dialog', {
      name: 'Visible fields',
      ...hidden,
    });

    view.rerender(
      <TransferListSelector
        label="Visible fields"
        options={OPTIONS}
        value={['name']}
        onChange={() => {}}
        commitBehavior="staged"
        isDisabled
      />,
    );
    const fieldset = dialog.querySelector('fieldset');
    expect(fieldset).not.toBeNull();
    expect(fieldset).toBeDisabled();

    const cancel = within(dialog).getByRole('button', {
      name: 'Cancel',
      hidden: true,
    });
    const apply = within(dialog).getByRole('button', {
      name: 'Apply',
      hidden: true,
    });
    expect(cancel).toBeEnabled();
    expect(fieldset).not.toContainElement(cancel);
    expect(apply).toBeDisabled();
    expect(
      screen.getByRole('combobox', {name: 'Visible fields'}),
    ).toHaveAttribute('aria-disabled', 'true');

    view.rerender(
      <TransferListSelector
        label="Visible fields"
        options={OPTIONS}
        value={['name']}
        onChange={() => {}}
        commitBehavior="staged"
        isLoading
      />,
    );

    await waitFor(() => {
      expect(dialog.querySelector('[aria-busy="true"]')).not.toBeNull();
    });
    // A pending change is announced with aria-busy, never by disabling the
    // fieldset: `disabled` here would blur the row button the user just
    // activated and drop focus to <body>.
    expect(dialog.querySelector('fieldset')).toBeEnabled();
    expect(
      within(dialog).getByRole('button', {name: 'Cancel', hidden: true}),
    ).toBeEnabled();
    expect(
      within(dialog).getByRole('button', {name: 'Apply', hidden: true}),
    ).toBeDisabled();
  });

  it('keeps focus on the activated row control while a change is pending', async () => {
    const user = userEvent.setup();
    const view = render(
      <TransferListSelector
        label="Visible fields"
        options={OPTIONS}
        value={['name']}
        onChange={() => {}}
      />,
    );
    await openSelector();
    const dialog = screen.getByRole('dialog', {
      name: 'Visible fields',
      ...hidden,
    });

    const addStatus = within(dialog).getByRole('button', {
      name: 'Add Status',
      hidden: true,
    });
    await user.click(addStatus);
    expect(addStatus).toHaveFocus();

    view.rerender(
      <TransferListSelector
        label="Visible fields"
        options={OPTIONS}
        value={['name']}
        onChange={() => {}}
        isLoading
      />,
    );

    await waitFor(() => {
      expect(dialog.querySelector('[aria-busy="true"]')).not.toBeNull();
    });
    expect(addStatus).toHaveFocus();
    expect(document.body).not.toHaveFocus();
  });

  it('forwards intentional selector shell and transfer-list content props', async () => {
    render(
      <TransferListSelector
        label="Table columns"
        description="Choose the columns shown in the table."
        options={OPTIONS}
        value={['name']}
        onChange={() => {}}
        triggerLabel="Customize columns"
        size="sm"
        placement="below"
        data-testid="column-selector"
        selectedLabel="Shown"
        availableLabel="Hidden"
        hasSearch
        searchPlaceholder="Find a column"
        isReorderable={false}
        hasSelectAll
        hasClear
        commitBehavior="staged"
        applyLabel="Save columns"
        cancelLabel="Discard changes"
      />,
    );

    expect(
      screen.getByText('Choose the columns shown in the table.'),
    ).toBeVisible();
    // data-testid lands on the trigger button inside the control box.
    expect(
      screen.getByTestId('column-selector').closest('.astryx-complex-selector'),
    ).toHaveAttribute('data-size', 'sm');
    expect(
      screen.getByRole('combobox', {name: 'Table columns'}),
    ).toHaveTextContent('Customize columns');
    expect(
      screen.getByTestId('column-selector').closest('.astryx-field'),
    ).toHaveStyle({
      '--x-width': 'min(41rem, calc(100vw - 32px))',
    });

    await openSelector('Table columns');
    await waitFor(() => {
      expect(
        screen.getByRole('dialog', {name: 'Table columns', ...hidden}),
      ).toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText('Find a column')).toBeInTheDocument();
    expect(screen.getAllByText('Shown')).not.toHaveLength(0);
    expect(screen.getAllByText('Hidden')).not.toHaveLength(0);
    expect(
      screen.getByRole('button', {name: 'Save columns', ...hidden}),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {name: 'Discard changes', ...hidden}),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {name: 'Reorder Name', ...hidden}),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', {name: 'Add all', ...hidden}),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {name: 'Clear', ...hidden}),
    ).toBeInTheDocument();

    const popover = screen
      .getByRole('dialog', {name: 'Table columns', ...hidden})
      .closest('[popover]');
    expect(popover?.getAttribute('style')).toContain(
      'position-area: self-block-end span-self-inline-end',
    );
  });
});

describe('TransferListSelector draft reset timing', () => {
  it('replaces a staged draft in the same commit as an external value change', async () => {
    const user = userEvent.setup();
    const frames: boolean[] = [];
    const onRender = () =>
      frames.push(
        screen.queryByRole('button', {name: 'Remove Owner', ...hidden}) != null,
      );
    const ui = (value: string[]) => (
      <Profiler id="selector" onRender={onRender}>
        <TransferListSelector
          label="Visible fields"
          options={OPTIONS}
          value={value}
          onChange={() => {}}
          commitBehavior="staged"
        />
      </Profiler>
    );
    const view = render(ui(['name', 'status']));
    await openSelector();
    await user.click(
      screen.getByRole('button', {name: 'Add Owner', ...hidden}),
    );
    expect(
      screen.getByRole('button', {name: 'Remove Owner', ...hidden}),
    ).toBeInTheDocument();

    frames.length = 0;
    view.rerender(ui(['name']));

    expect(frames.length).toBeGreaterThan(0);
    expect(frames).not.toContain(true);
    expect(
      screen.getByRole('button', {name: 'Add Owner', ...hidden}),
    ).toBeInTheDocument();
  });
});
