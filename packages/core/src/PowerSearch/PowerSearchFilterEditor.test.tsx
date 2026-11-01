// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PowerSearchFilterEditor.test.tsx
 * @input Uses vitest, @testing-library/react, PowerSearchFilterEditor
 * @output Unit tests for the default PowerSearch editor wrapper
 * @position Testing; validates PowerSearchFilterEditor.tsx config
 *   normalization, the field-keyed remount contract, and prop forwarding
 *
 * SYNC: When PowerSearchFilterEditor.tsx changes, update tests to match
 */

import {describe, it, expect, vi, beforeAll} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import {PowerSearchFilterEditor} from './PowerSearchFilterEditor';
import type {PowerSearchConfig, PartialFilter} from './types';

// =============================================================================
// Test infrastructure
// =============================================================================

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  globalThis.ResizeObserver = MockResizeObserver;
});

// =============================================================================
// Fixtures
// =============================================================================

const config: PowerSearchConfig = {
  name: 'TestSearch',
  fields: [
    {
      key: 'status',
      label: 'Status',
      operators: [{key: 'is', label: 'is', value: {type: 'string'}}],
    },
    {
      key: 'priority',
      label: 'Priority',
      operators: [{key: 'equals', label: 'equals', value: {type: 'string'}}],
    },
    {
      key: 'created',
      label: 'Created',
      operators: [
        {key: 'between', label: 'is between', value: {type: 'date_range'}},
      ],
    },
  ],
};

const statusFilter: PartialFilter = {
  field: 'status',
  operator: 'is',
  value: {type: 'string', value: 'open'},
};

const priorityFilter: PartialFilter = {
  field: 'priority',
  operator: 'equals',
  value: {type: 'string', value: 'high'},
};

const dateRangeFilter: PartialFilter = {
  field: 'created',
  operator: 'between',
  value: {
    type: 'date_range',
    value: {
      start: {
        type: 'ABSOLUTE',
        unixSeconds: Date.parse('2026-01-05T00:00:00Z') / 1000,
      },
      end: {
        type: 'ABSOLUTE',
        unixSeconds: Date.parse('2026-01-07T00:00:00Z') / 1000,
      },
    },
  },
};

function dateButton(date: string): HTMLButtonElement {
  const button = document.querySelector(`button[data-date="${date}"]`);
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Expected calendar button for ${date}`);
  }
  return button;
}

function valueInput(): HTMLInputElement {
  return screen.getByRole('textbox', {name: 'Value'});
}

/** The popover renders the field selector first, then the operator selector. */
function selectorTriggers(): HTMLElement[] {
  return screen.getAllByRole('combobox');
}

// =============================================================================
// Tests
// =============================================================================

describe('PowerSearchFilterEditor', () => {
  it('renders the editor with labels resolved from the raw config', () => {
    render(
      <PowerSearchFilterEditor
        config={config}
        filter={statusFilter}
        mode="edit"
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    // The config is indexed before it reaches the popover, so the field key
    // 'status' is displayed as its label 'Status' and 'is' as the operator.
    const [fieldTrigger, operatorTrigger] = selectorTriggers();
    expect(fieldTrigger).toHaveTextContent(/^Status$/);
    expect(operatorTrigger).toHaveTextContent(/^is$/);
    expect(valueInput()).toHaveValue('open');
  });

  it('discards in-progress edits when the filter field changes', () => {
    const {rerender} = render(
      <PowerSearchFilterEditor
        config={config}
        filter={statusFilter}
        mode="edit"
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.change(valueInput(), {target: {value: 'edited'}});
    expect(valueInput()).toHaveValue('edited');

    rerender(
      <PowerSearchFilterEditor
        config={config}
        filter={priorityFilter}
        mode="edit"
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    // A new field remounts the popover, so its state restarts from the
    // incoming filter instead of keeping the edit made against the old one.
    expect(valueInput()).toHaveValue('high');
    const [fieldTrigger, operatorTrigger] = selectorTriggers();
    expect(fieldTrigger).toHaveTextContent(/^Priority$/);
    expect(operatorTrigger).toHaveTextContent(/^equals$/);
  });

  it('keeps in-progress edits when only the filter value changes', () => {
    const {rerender} = render(
      <PowerSearchFilterEditor
        config={config}
        filter={statusFilter}
        mode="edit"
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.change(valueInput(), {target: {value: 'edited'}});

    rerender(
      <PowerSearchFilterEditor
        config={config}
        filter={{...statusFilter, value: {type: 'string', value: 'closed'}}}
        mode="edit"
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    // Same field — no remount, so the user's edit survives.
    expect(valueInput()).toHaveValue('edited');
  });

  it('forwards the save button label to the primary action', () => {
    render(
      <PowerSearchFilterEditor
        config={config}
        filter={statusFilter}
        mode="edit"
        onSave={vi.fn()}
        onCancel={vi.fn()}
        saveButtonLabel="Save"
      />,
    );

    expect(screen.getByRole('button', {name: 'Save'})).toBeInTheDocument();
    expect(screen.queryByRole('button', {name: 'Apply'})).toBeNull();
  });

  it('forwards the edited filter to onSave', () => {
    const onSave = vi.fn();
    render(
      <PowerSearchFilterEditor
        config={config}
        filter={statusFilter}
        mode="edit"
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.change(valueInput(), {target: {value: 'closed'}});
    fireEvent.click(screen.getByRole('button', {name: 'Apply'}));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({
      field: 'status',
      operator: 'is',
      value: {type: 'string', value: 'closed'},
    });
  });

  it('saves an ordered date range after reverse endpoint selection', () => {
    const onSave = vi.fn();
    render(
      <PowerSearchFilterEditor
        config={config}
        filter={dateRangeFilter}
        mode="edit"
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getAllByRole('button', {name: 'Open calendar'})).toHaveLength(
      1,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Open calendar'}));
    fireEvent.click(dateButton('2026-01-20'));
    fireEvent.click(dateButton('2026-01-10'));
    fireEvent.click(screen.getByRole('button', {name: 'Apply'}));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({
      field: 'created',
      operator: 'between',
      value: {
        type: 'date_range',
        value: {
          start: {
            type: 'ABSOLUTE',
            unixSeconds: Date.parse('2026-01-10T00:00:00Z') / 1000,
          },
          end: {
            type: 'ABSOLUTE',
            unixSeconds: Date.parse('2026-01-20T00:00:00Z') / 1000,
          },
        },
      },
    });
  });

  it('saves an ordered date range after keyboard endpoint selection and Apply', () => {
    const onSave = vi.fn();
    render(
      <PowerSearchFilterEditor
        config={config}
        filter={dateRangeFilter}
        mode="edit"
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', {name: 'Open calendar'}));

    const later = dateButton('2026-01-20');
    later.focus();
    fireEvent.keyDown(later, {key: 'Enter'});
    expect(onSave).not.toHaveBeenCalled();
    // jsdom does not synthesize the native button click from Enter.
    fireEvent.click(later);

    const earlier = dateButton('2026-01-10');
    earlier.focus();
    fireEvent.keyDown(earlier, {key: 'Enter'});
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(earlier);

    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', {name: 'Apply'}));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({
      field: 'created',
      operator: 'between',
      value: {
        type: 'date_range',
        value: {
          start: {
            type: 'ABSOLUTE',
            unixSeconds: Date.parse('2026-01-10T00:00:00Z') / 1000,
          },
          end: {
            type: 'ABSOLUTE',
            unixSeconds: Date.parse('2026-01-20T00:00:00Z') / 1000,
          },
        },
      },
    });
  });

  it('forwards onCancel to the cancel action', () => {
    const onCancel = vi.fn();
    render(
      <PowerSearchFilterEditor
        config={config}
        filter={statusFilter}
        mode="edit"
        onSave={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole('button', {name: 'Cancel'}));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('forwards the mode so only an existing filter offers deletion', () => {
    const {unmount} = render(
      <PowerSearchFilterEditor
        config={config}
        filter={statusFilter}
        mode="edit"
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', {name: 'Delete'})).toBeInTheDocument();
    unmount();

    render(
      <PowerSearchFilterEditor
        config={config}
        filter={statusFilter}
        mode="create"
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', {name: 'Delete'})).toBeNull();
  });

  it('forwards isReadOnly so the field and operator cannot be changed', () => {
    render(
      <PowerSearchFilterEditor
        config={config}
        filter={statusFilter}
        mode="edit"
        onSave={vi.fn()}
        onCancel={vi.fn()}
        isReadOnly
      />,
    );

    expect(screen.queryByRole('button', {name: 'Delete'})).toBeNull();
    const [fieldTrigger, operatorTrigger] = selectorTriggers();
    // Disabled triggers stay focusable (spec:AST-085 FR1).
    expect(fieldTrigger).toHaveAttribute('aria-disabled', 'true');
    expect(operatorTrigger).toHaveAttribute('aria-disabled', 'true');
  });
});
