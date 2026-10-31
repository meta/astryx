// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useTableActivation.test.tsx
 * @input useTableActivation, Table, React testing utilities
 * @output Functional tests for the row-activation plugin
 * @position Test file; validates controlled active state, press parity,
 *   handler composition, and accidental-activation guards
 */

import {describe, it, expect, vi, afterEach} from 'vitest';
import {useState} from 'react';
import {render, renderHook, screen, fireEvent} from '@testing-library/react';
import {createPortal} from 'react-dom';
import {Table} from '../../Table';
import {useTableActivation} from './useTableActivation';
import {useTableSelection} from '../selection/useTableSelection';
import type {TableColumn, TablePlugin} from '../../types';

// =============================================================================
// Test Data
// =============================================================================

interface Member extends Record<string, unknown> {
  id: string;
  name: string;
  team: string;
}

const members: Member[] = [
  {id: '1', name: 'Ada', team: 'Core'},
  {id: '2', name: 'Grace', team: 'Infra'},
  {id: '3', name: 'Alan', team: 'Core'},
];

const memberColumns: TableColumn<Member>[] = [
  {key: 'name', header: 'Name'},
  {key: 'team', header: 'Team'},
];

function bodyRows(): HTMLTableRowElement[] {
  // First row is the header row.
  return screen.getAllByRole('row').slice(1) as HTMLTableRowElement[];
}

afterEach(() => {
  document.getSelection()?.removeAllRanges();
});

// =============================================================================
// Controlled state reflection
// =============================================================================

describe('controlled active state', () => {
  it('reflects the controlled key as data-active on the matching row only', () => {
    function Harness() {
      const plugin = useTableActivation<Member>({
        activeKey: '2',
        onActivate: () => {},
      });
      return (
        <Table
          data={members}
          columns={memberColumns}
          idKey="id"
          plugins={{activation: plugin}}
        />
      );
    }
    render(<Harness />);
    const rows = bodyRows();
    expect(rows[0].hasAttribute('data-active')).toBe(false);
    expect(rows[1].getAttribute('data-active')).toBe('true');
    expect(rows[2].hasAttribute('data-active')).toBe(false);
  });

  it('moves active state to the new row when the controlled key changes', () => {
    function Harness({activeKey}: {activeKey: string | null}) {
      const plugin = useTableActivation<Member>({
        activeKey,
        onActivate: () => {},
      });
      return (
        <Table
          data={members}
          columns={memberColumns}
          idKey="id"
          plugins={{activation: plugin}}
        />
      );
    }
    const {rerender} = render(<Harness activeKey="1" />);
    expect(bodyRows()[0].getAttribute('data-active')).toBe('true');
    rerender(<Harness activeKey="3" />);
    const rows = bodyRows();
    expect(rows[0].hasAttribute('data-active')).toBe(false);
    expect(rows[2].getAttribute('data-active')).toBe('true');
  });

  it('does not re-render rows when only the controlled key changes', () => {
    const renderCell = vi.fn((item: Member) => item.name);
    const columns: TableColumn<Member>[] = [{key: 'name', renderCell}];
    function Harness({activeKey}: {activeKey: string | null}) {
      const plugin = useTableActivation<Member>({
        activeKey,
        onActivate: () => {},
      });
      return (
        <Table
          data={members}
          columns={columns}
          idKey="id"
          plugins={{activation: plugin}}
        />
      );
    }
    const {rerender} = render(<Harness activeKey="1" />);
    expect(renderCell).toHaveBeenCalledTimes(3);
    rerender(<Harness activeKey="2" />);
    // Active state moves through the store without row re-renders.
    expect(renderCell).toHaveBeenCalledTimes(3);
    expect(bodyRows()[1].getAttribute('data-active')).toBe('true');
  });

  it('emits no selection or navigation semantics', () => {
    function Harness() {
      const plugin = useTableActivation<Member>({
        activeKey: '1',
        onActivate: () => {},
      });
      return (
        <Table
          data={members}
          columns={memberColumns}
          idKey="id"
          plugins={{activation: plugin}}
        />
      );
    }
    render(<Harness />);
    for (const row of bodyRows()) {
      expect(row.getAttribute('aria-selected')).toBeNull();
      expect(row.getAttribute('aria-current')).toBeNull();
      // Native row semantics are kept: no button or link role.
      expect(row.getAttribute('role')).toBeNull();
    }
  });
});

// =============================================================================
// Plugin identity
// =============================================================================

describe('plugin identity', () => {
  it('returns one stable plugin while keys and callbacks change', () => {
    const firstActivate = vi.fn();
    const secondActivate = vi.fn();
    const {result, rerender} = renderHook(
      ({activeKey, onActivate}) =>
        useTableActivation<Member>({activeKey, onActivate}),
      {
        initialProps: {
          activeKey: '1',
          onActivate: firstActivate,
        },
      },
    );
    const first = result.current;
    rerender({activeKey: '2', onActivate: firstActivate});
    expect(result.current).toBe(first);
    rerender({activeKey: '2', onActivate: secondActivate});
    expect(result.current).toBe(first);
  });

  it('invokes the eligibility predicate at most once per row on mount', () => {
    const getIsItemActivatable = vi.fn(() => true);
    function Harness({activeKey}: {activeKey: string | null}) {
      const plugin = useTableActivation<Member>({
        activeKey,
        onActivate: () => {},
        getIsItemActivatable,
      });
      return (
        <Table
          data={members}
          columns={memberColumns}
          idKey="id"
          plugins={{activation: plugin}}
        />
      );
    }
    const {rerender} = render(<Harness activeKey={null} />);
    expect(getIsItemActivatable).toHaveBeenCalledTimes(3);
    // A controlled-key change reaches rows through the store without
    // re-resolving eligibility.
    rerender(<Harness activeKey="1" />);
    expect(getIsItemActivatable).toHaveBeenCalledTimes(3);
    expect(bodyRows()[0].getAttribute('data-active')).toBe('true');
  });
});

// =============================================================================
// Key equality
// =============================================================================

describe('key equality', () => {
  it('uses strict type-preserving equality for property keys', () => {
    // A property-name idKey resolves String(item[idKey]), so the numeric
    // activeKey 1 must not match the resolved "1".
    function Harness({activeKey}: {activeKey: string | number | null}) {
      const plugin = useTableActivation<Member>({
        activeKey,
        onActivate: () => {},
      });
      return (
        <Table
          data={members}
          columns={memberColumns}
          idKey="id"
          plugins={{activation: plugin}}
        />
      );
    }
    const {rerender} = render(<Harness activeKey={1} />);
    expect(bodyRows()[0].hasAttribute('data-active')).toBe(false);
    rerender(<Harness activeKey="1" />);
    expect(bodyRows()[0].getAttribute('data-active')).toBe('true');
  });

  it('preserves function-returned key types and emits the same key', () => {
    interface NumericRow extends Record<string, unknown> {
      id: number;
      name: string;
    }
    const rows: NumericRow[] = [
      {id: 1, name: 'Ada'},
      {id: 2, name: 'Grace'},
    ];
    const onActivate = vi.fn();
    function Harness({activeKey}: {activeKey: string | number | null}) {
      const plugin = useTableActivation<NumericRow>({
        activeKey,
        onActivate,
      });
      return (
        <Table
          data={rows}
          columns={[{key: 'name', header: 'Name'}]}
          idKey={item => item.id}
          plugins={{activation: plugin}}
        />
      );
    }
    const {rerender} = render(<Harness activeKey="1" />);
    // String "1" does not match the numeric resolved key 1.
    expect(bodyRows()[0].hasAttribute('data-active')).toBe(false);
    rerender(<Harness activeKey={1} />);
    expect(bodyRows()[0].getAttribute('data-active')).toBe('true');
    fireEvent.click(bodyRows()[1]);
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate).toHaveBeenCalledWith(rows[1], 2);
  });

  it('stays inert without an explicit idKey and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onActivate = vi.fn();
    try {
      function Harness() {
        const plugin = useTableActivation<Member>({
          activeKey: '1',
          onActivate,
        });
        return (
          <Table
            data={members}
            columns={memberColumns}
            plugins={{activation: plugin}}
          />
        );
      }
      render(<Harness />);
      const rows = bodyRows();
      for (const row of rows) {
        expect(row.hasAttribute('data-active')).toBe(false);
        expect(row.hasAttribute('tabindex')).toBe(false);
      }
      fireEvent.click(rows[0]);
      expect(onActivate).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });
});

// =============================================================================
// Pointer activation
// =============================================================================

describe('pointer activation', () => {
  function ActiveHarness({
    onActivate,
    getIsItemActivatable,
  }: {
    onActivate: (item: Member, key: string | number) => void;
    getIsItemActivatable?: (item: Member) => boolean;
  }) {
    const [activeKey, setActiveKey] = useState<string | null>(null);
    const plugin = useTableActivation<Member>({
      activeKey,
      onActivate: (item, key) => {
        onActivate(item, key);
        setActiveKey(key as string);
      },
      getIsItemActivatable,
    });
    return (
      <Table
        data={members}
        columns={memberColumns}
        idKey="id"
        plugins={{activation: plugin}}
      />
    );
  }

  it('activates on primary click and updates controlled state', () => {
    const onActivate = vi.fn();
    render(<ActiveHarness onActivate={onActivate} />);
    fireEvent.click(bodyRows()[0]);
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate).toHaveBeenCalledWith(members[0], '1');
    expect(bodyRows()[0].getAttribute('data-active')).toBe('true');
  });

  it('does not activate on auxiliary clicks', () => {
    const onActivate = vi.fn();
    render(<ActiveHarness onActivate={onActivate} />);
    const row = bodyRows()[0];
    fireEvent.click(row, {button: 2});
    fireEvent.click(row, {button: 1});
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('ignores clicks from nested interactive descendants', () => {
    const onActivate = vi.fn();
    const buttonActivate = vi.fn();
    const columns: TableColumn<Member>[] = [
      {key: 'name', header: 'Name'},
      {
        key: 'team',
        header: 'Team',
        renderCell: () => (
          <button type="button" onClick={buttonActivate}>
            Manage
          </button>
        ),
      },
    ];
    function Harness() {
      const plugin = useTableActivation<Member>({
        activeKey: null,
        onActivate,
      });
      return (
        <Table
          data={members}
          columns={columns}
          idKey="id"
          plugins={{activation: plugin}}
        />
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getAllByRole('button', {name: 'Manage'})[0]);
    expect(buttonActivate).toHaveBeenCalledTimes(1);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('ignores clicks from portalled controls', () => {
    const onActivate = vi.fn();
    const menuActivate = vi.fn();
    function PortalledMenu() {
      return createPortal(
        <button type="button" onClick={menuActivate}>
          Row menu
        </button>,
        document.body,
      );
    }
    const columns: TableColumn<Member>[] = [
      {
        key: 'name',
        header: 'Name',
        renderCell: item => (
          <>
            {item.name}
            <PortalledMenu />
          </>
        ),
      },
    ];
    function Harness() {
      const plugin = useTableActivation<Member>({
        activeKey: null,
        onActivate,
      });
      return (
        <Table
          data={members}
          columns={columns}
          idKey="id"
          plugins={{activation: plugin}}
        />
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getAllByRole('button', {name: 'Row menu'})[0]);
    expect(menuActivate).toHaveBeenCalledTimes(1);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('suppresses activation for an in-row text selection only', () => {
    const onActivate = vi.fn();
    render(<ActiveHarness onActivate={onActivate} />);
    const rows = bodyRows();
    // A selection elsewhere on the page does not block activation.
    const outsider = document.createElement('p');
    outsider.textContent = 'outside';
    document.body.appendChild(outsider);
    const outsideRange = document.createRange();
    outsideRange.selectNodeContents(outsider);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(outsideRange);
    fireEvent.click(rows[0]);
    expect(onActivate).toHaveBeenCalledTimes(1);
    // A non-collapsed selection intersecting the row suppresses it.
    const inRowRange = document.createRange();
    inRowRange.selectNodeContents(rows[1]);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(inRowRange);
    fireEvent.click(rows[1]);
    expect(onActivate).toHaveBeenCalledTimes(1);
    outsider.remove();
  });

  it('runs earlier handlers first and honors preventDefault cancellation', () => {
    const onActivate = vi.fn();
    const earlierEffect = vi.fn();
    const cancelling: TablePlugin<Member> = {
      transformBodyRow: props => ({
        ...props,
        htmlProps: {
          ...props.htmlProps,
          onClick: event => {
            earlierEffect(event.currentTarget);
            event.preventDefault();
          },
        },
      }),
    };
    function Harness() {
      const plugin = useTableActivation<Member>({
        activeKey: null,
        onActivate,
      });
      return (
        <Table
          data={members}
          columns={memberColumns}
          idKey="id"
          plugins={{cancelling, activation: plugin}}
        />
      );
    }
    render(<Harness />);
    fireEvent.click(bodyRows()[0]);
    // The earlier side effect is preserved while activation is cancelled.
    expect(earlierEffect).toHaveBeenCalledTimes(1);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('preserves earlier handler side effects on the activation path', () => {
    const onActivate = vi.fn();
    const earlierEffect = vi.fn();
    const observing: TablePlugin<Member> = {
      transformBodyRow: props => ({
        ...props,
        htmlProps: {
          ...props.htmlProps,
          onClick: event => {
            earlierEffect(event.currentTarget);
          },
        },
      }),
    };
    function Harness() {
      const plugin = useTableActivation<Member>({
        activeKey: null,
        onActivate,
      });
      return (
        <Table
          data={members}
          columns={memberColumns}
          idKey="id"
          plugins={{observing, activation: plugin}}
        />
      );
    }
    render(<Harness />);
    fireEvent.click(bodyRows()[0]);
    expect(earlierEffect).toHaveBeenCalledTimes(1);
    expect(onActivate).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// Keyboard activation
// =============================================================================

describe('keyboard activation', () => {
  function KeyboardHarness({
    onActivate,
    plugins,
  }: {
    onActivate: (item: Member, key: string | number) => void;
    plugins?: Record<string, TablePlugin<Member>>;
  }) {
    const activation = useTableActivation<Member>({
      activeKey: null,
      onActivate,
    });
    return (
      <Table
        data={members}
        columns={memberColumns}
        idKey="id"
        plugins={{...plugins, activation}}
      />
    );
  }

  it('makes eligible rows sequential focus stops with Enter/Space metadata', () => {
    render(<KeyboardHarness onActivate={() => {}} />);
    for (const row of bodyRows()) {
      expect(row.getAttribute('tabindex')).toBe('0');
      const shortcuts = row.getAttribute('aria-keyshortcuts') ?? '';
      expect(shortcuts).toContain('Enter');
      expect(shortcuts).toContain('Space');
    }
  });

  it('activates on Enter and Space', () => {
    const onActivate = vi.fn();
    render(<KeyboardHarness onActivate={onActivate} />);
    const row = bodyRows()[0];
    row.focus();
    fireEvent.keyDown(row, {key: 'Enter'});
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate).toHaveBeenCalledWith(members[0], '1');
    fireEvent.keyDown(row, {key: ' '});
    expect(onActivate).toHaveBeenCalledTimes(2);
  });

  it('prevents page scroll on Space and ignores key repeat', () => {
    const onActivate = vi.fn();
    render(<KeyboardHarness onActivate={onActivate} />);
    const row = bodyRows()[0];
    // Returning false means preventDefault was called.
    expect(fireEvent.keyDown(row, {key: ' '})).toBe(false);
    expect(onActivate).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(row, {key: ' ', repeat: true});
    fireEvent.keyDown(row, {key: 'Enter', repeat: true});
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('ignores keypresses starting in nested controls', () => {
    const onActivate = vi.fn();
    const columns: TableColumn<Member>[] = [
      {key: 'name', header: 'Name'},
      {
        key: 'team',
        header: 'Team',
        renderCell: () => <button type="button">Manage</button>,
      },
    ];
    function Harness() {
      const plugin = useTableActivation<Member>({
        activeKey: null,
        onActivate,
      });
      return (
        <Table
          data={members}
          columns={columns}
          idKey="id"
          plugins={{activation: plugin}}
        />
      );
    }
    render(<Harness />);
    const button = screen.getAllByRole('button', {name: 'Manage'})[0];
    button.focus();
    fireEvent.keyDown(button, {key: 'Enter'});
    fireEvent.keyDown(button, {key: ' '});
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('respects an earlier roving tabIndex while keeping activation', () => {
    const onActivate = vi.fn();
    const roving: TablePlugin<Member> = {
      transformBodyRow: props => ({
        ...props,
        htmlProps: {...props.htmlProps, tabIndex: -1},
      }),
    };
    render(<KeyboardHarness onActivate={onActivate} plugins={{roving}} />);
    const row = bodyRows()[0];
    expect(row.getAttribute('tabindex')).toBe('-1');
    row.focus();
    fireEvent.keyDown(row, {key: 'Enter'});
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('composes aria-keyshortcuts with earlier metadata', () => {
    const labelling: TablePlugin<Member> = {
      transformBodyRow: props => ({
        ...props,
        htmlProps: {...props.htmlProps, 'aria-keyshortcuts': 'Alt+A'},
      }),
    };
    render(<KeyboardHarness onActivate={() => {}} plugins={{labelling}} />);
    const shortcuts = bodyRows()[0].getAttribute('aria-keyshortcuts') ?? '';
    expect(shortcuts).toContain('Alt+A');
    expect(shortcuts).toContain('Enter');
    expect(shortcuts).toContain('Space');
  });
});

// =============================================================================
// Eligibility
// =============================================================================

describe('row eligibility', () => {
  it('leaves ineligible rows without affordance or state, even on key match', () => {
    const onActivate = vi.fn();
    function Harness() {
      const plugin = useTableActivation<Member>({
        activeKey: '2',
        onActivate,
        getIsItemActivatable: item => item.id !== '2',
      });
      return (
        <Table
          data={members}
          columns={memberColumns}
          idKey="id"
          plugins={{activation: plugin}}
        />
      );
    }
    render(<Harness />);
    const rows = bodyRows();
    // The key matches, but the ineligible row reflects nothing.
    expect(rows[1].hasAttribute('data-active')).toBe(false);
    expect(rows[1].hasAttribute('tabindex')).toBe(false);
    expect(rows[1].getAttribute('aria-keyshortcuts')).toBeNull();
    fireEvent.click(rows[1]);
    fireEvent.keyDown(rows[1], {key: 'Enter'});
    expect(onActivate).not.toHaveBeenCalled();
    // Eligible rows are unaffected.
    expect(rows[0].getAttribute('tabindex')).toBe('0');
  });
});

// =============================================================================
// Paint ownership and cleanup
// =============================================================================

describe('paint ownership and cleanup', () => {
  it('paints the active wash through a stylesheet class, never an inline style', () => {
    function Harness() {
      const plugin = useTableActivation<Member>({
        activeKey: '2',
        onActivate: () => {},
      });
      return (
        <Table
          data={members}
          columns={memberColumns}
          idKey="id"
          plugins={{activation: plugin}}
        />
      );
    }
    render(<Harness />);
    const rows = bodyRows();
    // The wash must not be inline: selection writes its fill inline, so an
    // inline active wash would race it. A stylesheet class always loses to
    // inline, making selection precedence deterministic.
    expect(rows[1].style.backgroundColor).toBe('');
    const activeClasses = new Set(rows[1].className.split(/\s+/));
    for (const row of [rows[0], rows[2]]) {
      for (const cls of row.className.split(/\s+/)) {
        activeClasses.delete(cls);
      }
    }
    // Only the wash classes distinguish the active row.
    expect(activeClasses.size).toBeGreaterThan(0);
  });

  it('composes with selection without clobbering either state', () => {
    function Harness() {
      const activation = useTableActivation<Member>({
        activeKey: '2',
        onActivate: () => {},
      });
      const selection = useTableSelection<Member>({
        getIsItemSelected: item => item.id === '2',
        onSelectItem: () => {},
        onSelectAll: () => {},
        getIsAllSelected: () => false,
      });
      return (
        <Table
          data={members}
          columns={memberColumns}
          idKey="id"
          plugins={{selection, activation}}
        />
      );
    }
    render(<Harness />);
    const rows = bodyRows();
    const activeRow = rows.find(
      row => row.getAttribute('data-active') === 'true',
    );
    expect(activeRow).toBeDefined();
    // Both owners reflect state on the same row; neither clears the other.
    expect(activeRow!.getAttribute('aria-selected')).toBe('true');
    // Activation contributes no inline fill of its own.
    expect(activeRow!.style.backgroundColor).not.toBe('');
  });

  it('clears active paint when the plugin is removed while mounted', () => {
    function Harness({withActivation}: {withActivation: boolean}) {
      const activation = useTableActivation<Member>({
        activeKey: '2',
        onActivate: () => {},
      });
      return (
        <Table
          data={members}
          columns={memberColumns}
          idKey="id"
          plugins={withActivation ? {activation} : {}}
        />
      );
    }
    const {rerender} = render(<Harness withActivation={true} />);
    expect(bodyRows()[1].getAttribute('data-active')).toBe('true');
    rerender(<Harness withActivation={false} />);
    for (const row of bodyRows()) {
      expect(row.hasAttribute('data-active')).toBe(false);
      expect(row.querySelector('[data-activation-bar]')).toBeNull();
    }
  });
});
