// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TableSelectionToolbar.test.tsx
 * @input Uses TableSelectionToolbar, Button, React Testing Library, Vitest
 * @output Behavior tests for the product-composed selection toolbar
 * @position Test file; validates state integration and Toolbar delegation
 */

import {describe, expect, it, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Button} from '../Button';
import {TableSelectionToolbar} from './TableSelectionToolbar';
import {OverflowList} from '../OverflowList';
import * as stylex from '@stylexjs/stylex';
import {foldableMarker} from '../internal/foldable.stylex';
import type {TableSelectionState} from './plugins/selection/useTableSelectionState';

function createSelectionState(
  selectedKeys: ReadonlySet<string>,
  clearSelection = vi.fn(),
): TableSelectionState {
  return {
    selectedKeys,
    selectedCount: selectedKeys.size,
    hasSelection: selectedKeys.size > 0,
    clearSelection,
  };
}

describe('TableSelectionToolbar', () => {
  it('renders nothing without a selection', () => {
    render(
      <TableSelectionToolbar
        selection={createSelectionState(new Set())}
        startContent={<Button label="Export" />}
      />,
    );

    expect(
      screen.queryByRole('toolbar', {name: 'Bulk actions'}),
    ).not.toBeInTheDocument();
  });

  it('renders product actions with synchronized selection status', () => {
    render(
      <TableSelectionToolbar
        selection={createSelectionState(new Set(['1', '2']))}
        startContent={<Button label="Export" variant="ghost" />}
      />,
    );

    const toolbar = screen.getByRole('toolbar', {name: 'Bulk actions'});
    expect(toolbar).toHaveAttribute('data-size', 'sm');
    expect(toolbar.closest('.astryx-section')).toHaveAttribute(
      'data-variant',
      'muted',
    );
    expect(screen.getByRole('button', {name: 'Export'})).toBeInTheDocument();
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(
      screen.getByRole('button', {name: 'Unselect All'}),
    ).toBeInTheDocument();
  });

  it('allows a custom selection label to render nothing', () => {
    render(
      <TableSelectionToolbar
        selection={createSelectionState(new Set(['1']))}
        renderSelectionLabel={() => null}
      />,
    );

    expect(screen.queryByText('1 selected')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', {name: 'Unselect All'}),
    ).toBeInTheDocument();
  });

  it('clears the complete selection through the shared state output', async () => {
    const user = userEvent.setup();
    const clearSelection = vi.fn();
    render(
      <TableSelectionToolbar
        selection={createSelectionState(new Set(['1']), clearSelection)}
      />,
    );

    await user.click(screen.getByRole('button', {name: 'Unselect All'}));
    expect(clearSelection).toHaveBeenCalledOnce();
  });

  it('supports product-specific toolbar, count, and clear labels', () => {
    render(
      <TableSelectionToolbar
        selection={createSelectionState(new Set(['1', '2', '3']))}
        label="Invoice actions"
        renderSelectionLabel={count => `${count} invoices selected`}
        clearLabel="Clear invoices"
      />,
    );

    expect(
      screen.getByRole('toolbar', {name: 'Invoice actions'}),
    ).toBeInTheDocument();
    expect(screen.getByText('3 invoices selected')).toBeInTheDocument();
    expect(
      screen.getByRole('button', {name: 'Clear invoices'}),
    ).toBeInTheDocument();
  });
});

describe('TableSelectionToolbar with folding actions (FR4)', () => {
  it('folds the actions in startContent while the count and Clear stay outside any foldable content', () => {
    render(
      <TableSelectionToolbar
        selection={createSelectionState(new Set(['a', 'b', 'c']))}
        startContent={
          <OverflowList
            overflowRenderer={items => <span>+{items.length}</span>}>
            <Button label="Export" variant="ghost" />
            <Button label="Delete" variant="ghost" />
          </OverflowList>
        }
      />,
    );
    const markerSelector = (stylex.props(foldableMarker).className ?? '')
      .split(' ')
      .filter(Boolean)
      .map(cls => `.${cls}`)
      .join('');
    const [startLane, endLane] = Array.from(
      screen.getByRole('toolbar').children,
    );
    expect(startLane.querySelector(markerSelector)).not.toBeNull();
    expect(endLane.querySelector(markerSelector)).toBeNull();
    expect(endLane).toHaveTextContent('3 selected');
  });
});
