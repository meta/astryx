// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TransferList.composition.test.tsx
 * @input Uses ComplexSelector, TransferList, React state, and Testing Library
 * @output Integration coverage for staged transfer-list selector behavior
 * @position Lab composition test; validates the two public component contracts together
 *
 * SYNC: When the ComplexSelector + TransferList staged contract changes, update this test.
 */

import {useEffect, useRef, useState} from 'react';
import {describe, expect, it, vi} from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {ComplexSelector} from '@astryxdesign/core/ComplexSelector';
import {TransferList, type TransferListOption} from './TransferList';

type Column = 'name' | 'owner' | 'status' | 'updated';

const OPTIONS: ReadonlyArray<TransferListOption<Column>> = [
  {value: 'name', label: 'Name'},
  {value: 'owner', label: 'Owner'},
  {value: 'status', label: 'Status'},
  {value: 'updated', label: 'Updated'},
];

const PRESETS = {
  compact: ['owner', 'name'],
} as const satisfies Record<string, readonly Column[]>;

const hidden = {hidden: true} as const;

function ResetDraftOnOpen({
  isOpen,
  appliedValue,
  onReset,
}: {
  isOpen: boolean;
  appliedValue: readonly Column[];
  onReset: (value: readonly Column[]) => void;
}) {
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      onReset([...appliedValue]);
    }
    wasOpenRef.current = isOpen;
  }, [appliedValue, isOpen, onReset]);

  return null;
}

function StagedColumnSelector({
  initialValue = ['name', 'status'],
  onCommit,
}: {
  initialValue?: readonly Column[];
  onCommit: (value: readonly Column[]) => void;
}) {
  const [appliedValue, setAppliedValue] =
    useState<readonly Column[]>(initialValue);
  const [draftValue, setDraftValue] = useState<readonly Column[]>(initialValue);

  return (
    <>
      <output data-testid="applied-value">
        {JSON.stringify(appliedValue)}
      </output>
      <ComplexSelector
        label="View options"
        value={appliedValue}
        onChange={nextValue => {
          onCommit(nextValue);
          setAppliedValue(nextValue);
        }}
        triggerLabel="View options">
        {(_value, commit, close, state) => (
          <div>
            <ResetDraftOnOpen
              isOpen={state.isOpen}
              appliedValue={appliedValue}
              onReset={setDraftValue}
            />
            <output data-testid="draft-value">
              {JSON.stringify(draftValue)}
            </output>
            <button
              type="button"
              onClick={() => setDraftValue(PRESETS.compact)}>
              Compact preset
            </button>
            <TransferList
              label="Table columns"
              isLabelHidden
              selectedLabel="Visible fields"
              availableLabel="Available fields"
              options={OPTIONS}
              value={draftValue}
              onChange={setDraftValue}
            />
            <button type="button" onClick={close}>
              Close
            </button>
            <button
              type="button"
              onClick={() => {
                commit([...draftValue]);
                close();
              }}>
              Apply
            </button>
          </div>
        )}
      </ComplexSelector>
    </>
  );
}

function openSelector(): void {
  fireEvent.keyDown(screen.getByRole('combobox', {name: 'View options'}), {
    key: 'ArrowDown',
  });
}

describe('ComplexSelector + TransferList composition', () => {
  it('keeps changes in a draft until Apply commits the ordered value once', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(
      <StagedColumnSelector
        initialValue={['status', 'name']}
        onCommit={onCommit}
      />,
    );

    openSelector();
    await waitFor(() => {
      expect(
        screen.getByRole('combobox', {name: 'View options'}),
      ).toHaveAttribute('aria-expanded', 'true');
    });

    await user.click(
      screen.getByRole('button', {name: 'Add Owner', ...hidden}),
    );

    expect(screen.getByTestId('draft-value')).toHaveTextContent(
      '["status","name","owner"]',
    );
    expect(screen.getByTestId('applied-value')).toHaveTextContent(
      '["status","name"]',
    );
    expect(onCommit).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', {name: 'Apply', ...hidden}));

    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith(['status', 'name', 'owner']);
    expect(screen.getByTestId('applied-value')).toHaveTextContent(
      '["status","name","owner"]',
    );
  });

  it('discards closed and light-dismissed drafts before reopening', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<StagedColumnSelector onCommit={onCommit} />);
    const trigger = screen.getByRole('combobox', {name: 'View options'});

    openSelector();
    await user.click(
      screen.getByRole('button', {name: 'Remove Name', ...hidden}),
    );
    expect(screen.getByTestId('draft-value')).toHaveTextContent('["status"]');

    await user.click(screen.getByRole('button', {name: 'Close', ...hidden}));
    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByTestId('applied-value')).toHaveTextContent(
      '["name","status"]',
    );

    openSelector();
    await waitFor(() => {
      expect(screen.getByTestId('draft-value')).toHaveTextContent(
        '["name","status"]',
      );
    });
    await user.click(
      screen.getByRole('button', {name: 'Remove Status', ...hidden}),
    );
    expect(screen.getByTestId('draft-value')).toHaveTextContent('["name"]');

    const popover = screen
      .getByRole('dialog', {name: 'View options', ...hidden})
      .closest('[popover]');
    expect(popover).not.toBeNull();
    const dismissEvent = new Event('toggle');
    Object.defineProperty(dismissEvent, 'newState', {value: 'closed'});
    fireEvent(popover as HTMLElement, dismissEvent);

    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });
    expect(onCommit).not.toHaveBeenCalled();

    openSelector();
    await waitFor(() => {
      expect(screen.getByTestId('draft-value')).toHaveTextContent(
        '["name","status"]',
      );
    });
  });

  it('lets a preset replace the draft without committing it', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<StagedColumnSelector onCommit={onCommit} />);

    openSelector();
    await user.click(
      screen.getByRole('button', {name: 'Compact preset', ...hidden}),
    );

    expect(screen.getByTestId('draft-value')).toHaveTextContent(
      '["owner","name"]',
    );
    expect(screen.getByTestId('applied-value')).toHaveTextContent(
      '["name","status"]',
    );
    expect(onCommit).not.toHaveBeenCalled();

    const selectedList = screen.getByRole('list', {
      name: 'Visible fields',
      ...hidden,
    });
    expect(
      within(selectedList)
        .getAllByRole('listitem', hidden)
        .map(item => item.textContent?.trim()),
    ).toEqual(['Owner', 'Name']);
  });

  it('lets Escape cancel an active reorder without closing the selector', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<StagedColumnSelector onCommit={onCommit} />);
    const trigger = screen.getByRole('combobox', {name: 'View options'});

    openSelector();
    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
    });
    await waitFor(() => {
      expect(
        screen.getByRole('button', {name: 'Compact preset', ...hidden}),
      ).toHaveFocus();
    });

    const reorder = screen.getByRole('button', {
      name: 'Reorder Name',
      ...hidden,
    });
    reorder.focus();
    await user.keyboard('{Enter}{ArrowDown}');
    expect(screen.getByTestId('draft-value')).toHaveTextContent(
      '["status","name"]',
    );

    await user.keyboard('{Escape}');

    expect(screen.getByTestId('draft-value')).toHaveTextContent(
      '["name","status"]',
    );
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(onCommit).not.toHaveBeenCalled();
  });
});
